// 方向枚举
var DIRECTION = {
	STOP:1,
	UP:2,
	DOWN:3,
	LEFT:4,
	RIGHT:5
}

// 方向枚举的字符串，仅用于log
var DIRECTION_STR = {
	1:"STOP",
	2:"UP",
	3:"DOWN",
	4:"LEFT",
	5:"RIGH"
}

// 游戏状态枚举
var STATUS = {
	WAIT:1,
	START:2,
	END:3
}

// 游戏对象
var GameObject = function(id) {
	this.id = id;
	this.x = 0;
	this.y = 0;
	this.direction = DIRECTION.STOP;
	this.speed = 100;
	this.move = function (dt) {
		switch(this.direction) {
			case DIRECTION.UP:
				this.y -= this.speed * dt;
				break;
			case DIRECTION.DOWN:
				this.y += this.speed * dt;
				break;
			case DIRECTION.LEFT:
				this.x -= this.speed * dt;
				break;
			case DIRECTION.RIGHT:
				this.x += this.speed * dt;
				break;
		}
	}
}

$(function () {
	// 画布
	var context = document.getElementById("canvas").getContext("2d");
	// 每个step的间隔
	var stepInterval = 0.20;
	// 当前step时间戳
	var stepTime = 0;
	// 游戏开始时间
	var gameStartTime = 0;
	// 输入方向
	var inputDirection = null;
	// 游戏状态
	var gameStatus = STATUS.WAIT;
	// 接受指令
	var recvCommands = new Array();
	// 未能按时到达的指令
	var delayCommands = new Array();
	// 所有游戏对象
	var gameObjects = {}
	// 判断掉线，暂停游戏
	var isNetDelay = false;
	// 是否连接socket
	var isConnected = false;
	// 模拟丢包计数
	var simulateLossCount = 0;
	// 时差
	var timeDiff = 0

	// 初始化UI显示
	$("#content").hide();
	$("#login").show();
	$("#tips").hide();

	function getTime() {
		return Date.now() + timeDiff
	}

	// 连接socket
	socket = io.connect('http://120.78.185.209:3000');

	// socket连接成功
	socket.on('open', function(id) {
		isConnected = true;
		console.log("Socket连接成功：",id);
	});

	// 收到游戏开始事件
	socket.on('start',function(json) {
		// 初始化GameObject
		for(var i = 0; i < json.player.length; ++i) {
			var id = json.player[i];
			gameObjects[id] = new GameObject(id);
		}
		gameStartTime = json.time;
		// 处理重连
		var delay = getTime() - gameStartTime;
		if(delay > 0) {
			stepTime = parseInt(delay / stepInterval / 1000);
		}
		console.log("游戏预计开始时间:", gameStartTime);
	});

	// 收到加入游戏结果
	socket.on('join',function(json) {
		showTips(json.message);
		if(json.result) {
			$("#login").hide();
			$("#content").show();
		}
	});

	// 收到系统消息
	socket.on('system',function(msg) {
		showTips(msg);
	});

	// 收到指令
	socket.on('message',function(json){
		// 模拟丢包
		if(simulateLossCount > 0) {
			delayCommands = delayCommands.concat(json);
			simulateLossCount--;
			return;
		}

		// 储存收到的指令
		recvCommands = recvCommands.concat(delayCommands);
		recvCommands = recvCommands.concat(json);
		delayCommands = new Array();
	});

	// 对时
	var totalDiff = 0
	var diffCount = 0
	socket.on('timeSync',function(json) {
		var client = json.client;
		var server = json.server;
		var now = getTime();
		var delay = now - client;
		var diff = server - (client + delay / 2);
		diffCount++;
		totalDiff += diff;
		if(diffCount > 60) {
			$("#lag").text("延迟：" + delay + "ms")
			diff = Math.round(totalDiff / diffCount)
			// console.log(now, client, server, diff)
			timeDiff += diff
			diffCount = 0
			totalDiff = 0
		}
	});

	// 断线
	socket.on('disconnect',function() {
		showTips("与服务器断开连接!")
	});

	// 发送指令
	function sendCommand() {
		var direction = inputDirection;
		var time = stepTime;
		socket.emit("message", {
			direction: direction,
			time:time,
		});
	}

	// step定时器
	function stepUpdate() {
		stepTime++;
		if(stepTime == 1) {
			return;
		}

		// 判断丢包
		if(recvCommands.length == 0) {
			isNetDelay = true;
			console.log("Step:", stepTime, "丢包，暂停游戏")
		} else {
			isNetDelay = false;
			console.log("Step:", stepTime, "收到指令", getTime())
		}
		
		// 执行指令
		for(var i = 0; i < recvCommands.length; ++i) {
			var command = recvCommands[i];
			var obj = gameObjects[command.id];
			if(command.direction) {
				obj.direction = command.direction;
			}
			// 丢包补偿
			var delay = stepTime - command.time - 2;
			if(delay > 0 && obj.direction != DIRECTION.STOP) {
				obj.move(stepInterval);
				console.log("Step:", stepTime, obj.id, "补偿Step:", command.time + 2, "方向:", DIRECTION_STR[obj.direction]);
			}
		}
		recvCommands = new Array();
	}

	// frame定时器
	var stepUpdateCounter = 0;
	function update(dt) {
		var now = getTime();
		if(gameStatus == STATUS.START) {
			stepUpdateCounter += dt;
			if(stepUpdateCounter >= stepInterval) {
				stepUpdate();
				stepUpdateCounter -= stepInterval;
			}
			context.clearRect(0, 0, 600, 400);
			for(var key in gameObjects) {
				var obj = gameObjects[key];
				if(!isNetDelay) {
					obj.move(dt)
				}
				context.fillStyle = "#000000";
				context.fillRect(obj.x, obj.y, 30, 30);
			}
		} else if(gameStartTime != 0 && now > gameStartTime) {
			console.log("游戏开始:", now);
			gameStatus = STATUS.START;
		}
	}

	// 启动定时器
	var lastUpdate = getTime();
	setInterval(function() {
		var now = getTime();
		var dt = (now - lastUpdate) / 1000;
		lastUpdate = now;
		update(dt)
		if(isConnected == true) {
			socket.emit("timeSync", now);
		}
	});

	// 键盘事件
	$('body').keydown(function(e) {
		if(gameStatus != STATUS.START) return;
		switch(e.keyCode) {
			case 38: inputDirection = DIRECTION.UP; break;
			case 40: inputDirection = DIRECTION.DOWN; break;
			case 37: inputDirection = DIRECTION.LEFT; break;
			case 39: inputDirection = DIRECTION.RIGHT; break;
			case 13: inputDirection = DIRECTION.STOP; break;
		}
		sendCommand();
	});

	// 开始游戏
	$('#start_btn').click(function(){
		var account = $("#account").val();
		if(isConnected == false) {
			showTips("连接服务器失败！");
		} else if(account == "") {
			showTips("账号不能为空！")
		} else {
			socket.emit("join", account);
		}
	});

	// 模拟增加20帧丢包
	$('#loss_btn').click(function(){
		simulateLossCount += 20;
	});

	// 断线重连
	$('#reconnect_btn').click(function(){
		location.reload();
	});
});

// 弹一个Tips
function showTips(str) {
	var width = str.length * 20 + 50;
	var halfScreenWidth = $(window).width() / 2;
	var halfScreenHeight = $(window).height() / 2;
	$("#tips").stop();
	$("#tips").show();
	$("#tips").text(str);
	$("#tips").css("width", width);
	$("#tips").css("top", halfScreenHeight);
	$("#tips").css("left", halfScreenWidth - width / 2);
	$("#tips").animate({top:halfScreenHeight - 100});
	$("#tips").fadeOut();
	console.log(str);
}