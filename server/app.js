var server = require('http').Server();
var io = require('socket.io')(server);

var g_onlines = {}; // 所有在线玩家
var g_commands = new Array(); // 指令数组
var g_joinCount = 0; // 已准备的人数
var g_maxJoinCount = 2; // 最大人数
var g_stepTime = 0; // 当前step时间戳
var g_stepInterval = 0.20; // 每个step的间隔
var g_gameStartTime = 0; // 游戏开始时间

// 游戏状态枚举
var STATUS = {
	WAIT:1,
	START:2
}
var g_gameStatus = STATUS.WAIT;

io.on('connection', function (socket) {
	socket.emit("open", socket.id);

	socket.on('join', function() {
		if(g_joinCount == g_maxJoinCount) {
			console.log("游戏已经开始，", socket.id, "加入失败");
			socket.emit('full');
			return;
		}

		if(g_joinCount < g_maxJoinCount) {
			console.log(socket.id, "加入游戏")
			g_onlines[socket.id] = {socket: socket};
			g_joinCount++;
		}
		if(g_joinCount == g_maxJoinCount) {
			g_gameStatus = STATUS.WAIT;
			g_gameStartTime = Date.now() + 500;
			g_commands = new Array();
			console.log("游戏预计开始时间:", g_gameStartTime);
			for(var key in g_onlines) {
				g_onlines[key].socket.emit('start', {time: g_gameStartTime, player:Object.keys(g_onlines)});
			}
		}
	});

	socket.on('message', function(json) {
		if(g_gameStatus == STATUS.START) {
			if(json.time != g_stepTime) {
				json.time = g_stepTime;
			}
			json.id = socket.id;
			g_commands.push(json)
		}
	});

	socket.on('disconnect', function () {
		if(g_onlines[socket.id]) {
			console.log(socket.id, "离开游戏，游戏结束！");
			g_joinCount = 0;
			g_stepTime = 0;
			g_gameStartTime = 0;
			g_gameStatus = STATUS.WAIT;
			io.sockets.emit('over');
			g_onlines = {};
		}
	});
});

// step定时器
function stepUpdate() {
	g_stepTime++;

	var message = g_commands;
	g_commands = new Array();

	// 模拟30ms的正常网络延迟，发送指令
	setTimeout(function(){
		for(var key in g_onlines) {
			g_onlines[key].socket.emit('message', message);
		}
	}, 30);
}

// frame定时器
var stepUpdateCounter = 0;
function update(dt) {
	var now = Date.now();
	if(g_gameStatus == STATUS.START) {
		stepUpdateCounter += dt;
		if(stepUpdateCounter >= g_stepInterval) {
			stepUpdate();
			stepUpdateCounter -= g_stepInterval;
		}
	} else if(g_gameStartTime != 0 && now > g_gameStartTime) {
		console.log("游戏开始:", now);
		g_gameStatus = STATUS.START;
	}
}

// 启动定时器
var lastUpdate = Date.now();
setInterval(function() {
	var now = Date.now();
	var dt = (now - lastUpdate) / 1000;
	lastUpdate = now;
	update(dt)
});

// 监听3000端口
server.listen(3000, function(){
	console.log("服务器启动成功，监听端口3000");
});