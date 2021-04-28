const express = require("express");
const socketIO = require("socket.io");
const http = require("http");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const PORT = process.env.PORT || 5000;
const app = express();

app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, './build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, './build/index.html'));
});

const server = http.createServer(app);

const io = socketIO(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const roomSchema = {
    players: [],
    text: "",
    code: "",
    nextPlace: 1,
    start: false
};

let rooms = {};
let players = {};

function CreateRoomCode(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function GetNicknameFromId(socket) {
    return players[socket].nick;
}

async function GetTextFromApi() {
    try {
        let res = await axios.get("http://metaphorpsum.com/paragraphs/1");
        return res.data;
    } catch (err) {
        console.error(err);
        return;
    }
}

function PlayerConnect(socket, nick) {
    players[socket.id] = {
        nick
    }
}

async function CreateRoom(socket) {
    let roomCode = CreateRoomCode(5);
    rooms[roomCode] = {
        players: [],
        text: "",
        code: "",
        nextPlace: 1,
        start: false
    };
    rooms[roomCode].code = roomCode;
    let txt = await GetTextFromApi();
    rooms[roomCode].text = txt;
    JoinRoom(roomCode, socket, true);
    io.in(roomCode).emit("RoomInfo", rooms[roomCode]);
    console.log("\n ----------------------------ROOMS-----------------------------");
    console.log(JSON.stringify(rooms, null, 2));
}

function JoinRoom(roomCode, socket, isHost) {
    if (rooms[roomCode]) {
        socket.join(roomCode);
        rooms[roomCode].players.push({
            id: socket.id,
            nick: GetNicknameFromId(socket.id),
            progress: 0,
            isHost,
            color: Math.random()*360,
            place: ""
        })
        return true;
    }
    return false;
}

function Disconnect(socket) {
    delete players[socket.id];
    for (let room in rooms) {
        for (let i = 0; i<rooms[room].players.length; i++) {
            if (rooms[room].players[i].id === socket.id) {
                rooms[room].players.splice(i, 1);
            }
        }
    }
}

function UpdateWinner(roomCode, socket) {
    for (let player of rooms[roomCode].players) {
        if (player.id === socket.id && player.place === "") {
            player.place = "Finished " + rooms[roomCode].nextPlace;
            rooms[roomCode].nextPlace ++;
        }
    }
}

async function Restart(roomCode) {
    let txt = await GetTextFromApi();
    rooms[roomCode].text = txt;
    for (let player of rooms[roomCode].players) {
        player.progress = 0;
        player.place = "";
    }
    rooms[roomCode].start = false;
    rooms[roomCode].nextPlace = 1;
    io.in(roomCode).emit("RoomInfo", rooms[roomCode]);
}

io.on("connection", (socket) => {
    console.log(`${socket.id} Has Connected :)`);
    console.log(`Clients Connected: ${io.engine.clientsCount}`);
    socket.on("CreateNickname", (nick) => {
        PlayerConnect(socket, nick);
    })
    socket.on("CreateRoom", () => {
        CreateRoom(socket);
    })
    socket.on("JoinRoom", (roomCode) => {
        if (JoinRoom(roomCode, socket, false)) {
            io.in(roomCode).emit("RoomInfo", rooms[roomCode]);
        }
    })
    socket.on("UpdateProgress", (roomCode, progress) => {
        for (let player of rooms[roomCode].players) {
            if (player.id === socket.id) {
                player.progress = progress;
                io.in(roomCode).emit("RoomInfo", rooms[roomCode]);
            }
        }
    })
    socket.on("Completed", (roomCode) => {
        UpdateWinner(roomCode, socket);
    })
    socket.on("Start", (roomCode) => {
        rooms[roomCode].start = true;
        io.in(roomCode).emit("RoomInfo", rooms[roomCode]);
    })
    socket.on("Restart", (roomCode) => {
        Restart(roomCode);
    })
    socket.on("disconnect", () => {
        console.log(`${socket.id} Has Disconnected :(`);
        Disconnect(socket);
    })
})

server.listen(PORT, () => console.log(`Server Listening On Port ${PORT}`));
//app.listen(PORT, () => console.log(`Server Listening On Port ${PORT}`));



