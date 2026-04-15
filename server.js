const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let waitingPlayer = null;
let games = {};
let stats = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // 👤 Profile
  socket.on("setName", (name) => {
    socket.data.name = name || "Player";

    if (!stats[socket.id]) {
      stats[socket.id] = { wins: 0, losses: 0 };
    }

    socket.emit("stats", stats[socket.id]);
    findMatch(socket);
  });

  // 🔎 Matchmaking
  function findMatch(socket) {
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      startGame(waitingPlayer, socket);
      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
      socket.emit("status", "⏳ Waiting for opponent...");
    }
  }

  // 🎮 Start game
  function startGame(p1, p2) {
    const room = "room_" + p1.id + "_" + p2.id;

    p1.join(room);
    p2.join(room);

    games[room] = {
      players: [p1.id, p2.id],
      secrets: {},
      guesses: {},
      round: 1
    };

    io.to(room).emit("matched", {
      players: [
        { id: p1.id, name: p1.data.name },
        { id: p2.id, name: p2.data.name }
      ]
    });

    io.to(room).emit("startSetup");
  }

  // 🔐 Secret
  socket.on("setSecret", ({ secret }) => {
    const room = [...socket.rooms][1];
    if (!room) return;

    const game = games[room];
    game.secrets[socket.id] = secret;

    if (Object.keys(game.secrets).length === 2) {
      io.to(room).emit("startGame", game.round);
    }
  });

  // 🎯 Guess
  socket.on("guess", (guess) => {
    const room = [...socket.rooms][1];
    const game = games[room];
    if (!game) return;

    const opponent = game.players.find(id => id !== socket.id);
    const secret = game.secrets[opponent];

    let result =
      guess < secret ? "Higher ⬆️" :
      guess > secret ? "Lower ⬇️" :
      "Correct 🎯";

    game.guesses[socket.id] = (guess === secret);

    socket.emit("result", result);

    if (Object.keys(game.guesses).length === 2) {
      const [p1, p2] = game.players;
      const p1Win = game.guesses[p1];
      const p2Win = game.guesses[p2];

      const p1Name = io.sockets.sockets.get(p1)?.data.name;
      const p2Name = io.sockets.sockets.get(p2)?.data.name;

      if (p1Win && p2Win) {
        io.to(room).emit("gameOver", "🤝 Draw!");
      } else if (p1Win) {
        updateStats(p1, true);
        updateStats(p2, false);
        io.to(room).emit("gameOver", `🏆 ${p1Name} Wins!`);
      } else if (p2Win) {
        updateStats(p2, true);
        updateStats(p1, false);
        io.to(room).emit("gameOver", `🏆 ${p2Name} Wins!`);
      } else {
        game.round++;
        game.guesses = {};
        io.to(room).emit("nextRound", game.round);
      }
    }
  });

  // 📊 Stats
  function updateStats(id, win) {
    if (!stats[id]) stats[id] = { wins: 0, losses: 0 };
    if (win) stats[id].wins++;
    else stats[id].losses++;

    io.to(id).emit("stats", stats[id]);
  }

  // ❌ Disconnect
  socket.on("disconnect", () => {
    if (waitingPlayer?.id === socket.id) {
      waitingPlayer = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});