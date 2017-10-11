var server = require('http').Server();
var io = require('socket.io')(server);

var g_onlines = {}; // 所有在线玩家
var g_commands = new Array(); // 指令数组
var g_commands_histroy = new Array(); // 历史指令，用于断线重连
var g_joinCount = 0; // 已准备的人数
var g_maxJoinCount = 2; // 最大人数
var g_stepTime = 0; // 当前step时间戳
var g_stepInterval = 0.20; // 每个step的间隔
var g_gameStartTime = 0; // 游戏开始时间
var g_simulateNetDelay = 30; // 模拟正常的30ms网络延迟

// 游戏状态枚举
var STATUS = {
	WAIT:1,
	START:2
}
var g_gameStatus = STATUS.WAIT;

io.on('connection', function (socket) {
	socket.emit("open", socket.id);

	// 获取用户账户
	function getAccount(socketId) {
		for(var key in g_onlines) {
			if(socketId == g_onlines[key].socket.id) {
				return key;
			}
		}
	}

	socket.on('join', function(account) {
		// 顶号/断线重连
		if(g_onlines[account]) {
			g_onlines[account].socket.disconnect();
			if(g_gameStatus == STATUS.START) {
				g_onlines[account] = {socket: socket, online: true};
				socket.emit('join', {result:true, message:"正在断线重连..."});
				console.log(account, "重连游戏");
				socket.emit('start', {time: g_gameStartTime, player:Object.keys(g_onlines)});
				socket.broadcast.emit('system', account + "重新连接！");
				socket.emit('message', g_commands_histroy);
				return;
			}
		}
		// 房间已满
		if(g_joinCount == g_maxJoinCount) {
			console.log("房间已满", account, "加入失败");
			socket.emit('join', {result:false, message:"房间已满！"});
			socket.disconnect();
			return;
		}
		// 加入游戏
		if(g_joinCount < g_maxJoinCount) {
			console.log(account, "加入游戏");
			socket.emit('join', {result:true, message:"匹配中..."});
			g_onlines[account] = {socket: socket, online: true};
			g_joinCount++;
		}
		// 开始游戏
		if(g_joinCount == g_maxJoinCount) {
			g_gameStatus = STATUS.WAIT;
			g_gameStartTime = Date.now() + 500;
			g_commands = new Array();
			g_commands_histroy = new Array();
			console.log("游戏预计开始时间:", g_gameStartTime);
			io.sockets.emit('start', {time: g_gameStartTime, player:Object.keys(g_onlines)});
		}
	});

	socket.on('message', function(json) {
		if(g_gameStatus == STATUS.START) {
			if(json.time != g_stepTime) {
				json.time = g_stepTime;
			}
			json.id = getAccount(socket.id);
			g_commands.push(json)
		}
	});

	socket.on('disconnect', function () {
		var account = getAccount(socket.id);
		if(account) {
			g_onlines[account].online = false;
			console.log(account, "离开游戏");
			var isGameOver = true;
			for(var key in g_onlines) {
				if(g_onlines[key].online) {
					isGameOver = false;
				}
			}
			if(isGameOver) {
				g_joinCount = 0;
				g_stepTime = 0;
				g_gameStartTime = 0;
				g_gameStatus = STATUS.WAIT;
				g_onlines = {};
				console.log("游戏结束");
			} else {
				io.sockets.emit('system', account + "离开了游戏！");
			}
		}
	});
});

// step定时器
function stepUpdate() {
	g_stepTime++;
	// 过滤同帧多次指令
	var message = {}
	for(var key in g_onlines) {
		message[key] = {time:g_stepTime - 1, id:key};
	}
	for(var i = 0; i < g_commands.length; ++i) {
		var command = g_commands[i];
		message[command.id] = command;
	}
	g_commands = new Array();

	// 模拟30ms的正常网络延迟，发送指令
	setTimeout(function(){
		var commands = new Array();
		for(var key in message) {
			commands.push(message[key]);
		}
		g_commands_histroy = g_commands_histroy.concat(commands);
		io.sockets.emit('message', commands);
	}, g_simulateNetDelay);
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