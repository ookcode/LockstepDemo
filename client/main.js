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
		dt = dt / 1000;
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
	// 每个step的间隔ms，服务器返回
	var stepInterval = 0;
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
	// 所有游戏对象
	var gameObjects = {}
	// 判断掉线，暂停游戏
	var isNetDelay = false;
	// 是否连接socket
	var isConnected = false;
	// 和服务器时间差异
	var timeDiff = 0

	// 初始化UI显示
	$("#content").hide();
	$("#login").show();
	$("#tips").hide();

	// 服务器时间，用于统一开始时间线
	function getTime() {
		return Date.now() + timeDiff
	}

	// 连接socket
	socket = io.connect('http://120.78.185.209:3000');

	// socket连接成功
	socket.on('open', function(json) {
		isConnected = true;
		stepInterval = json.stepInterval
		id = json.id
		console.log("Socket连接成功：", id);
	});

	// 收到游戏开始事件
	socket.on('start',function(json) {
		// 初始化GameObject
		for(var i = 0; i < json.player.length; ++i) {
			var id = json.player[i];
			gameObjects[id] = new GameObject(id);
		}
		gameStartTime = json.time;
		stepTime = json.stepTime;
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
		// 储存收到的指令
		recvCommands = recvCommands.concat(json);
	});

	// 对时
	socket.on('timeSync',function(json) {
		var client = json.client;
		var server = json.server;
		var delay = Date.now() - client; // 网络延迟
		$("#lag").text("延迟：" + delay + "ms")
		if(delay < 100) {
			timeDiff = Math.round(server - (client - delay / 2));
		}
	});

	// 断线
	socket.on('disconnect',function() {
		showTips("与服务器断开连接!")
	});

	// 发送指令
	function sendCommand() {
		var direction = inputDirection;
		socket.emit("message", {
			direction: direction,
			time:stepTime,
		});
	}

	// step定时器
	function stepUpdate() {
		stepTime++;

		// 执行指令
		var hasCurrentStepCommands = false;
		for(var i = 0; i < recvCommands.length; ++i) {
			var command = recvCommands[i];
			var obj = gameObjects[command.id];
			if(command.direction) {
				obj.direction = command.direction;
			}
			var delay = stepTime - command.time - 1;
			if(delay == 0) {
				hasCurrentStepCommands = true;
				console.log("Step:", stepTime, obj.id, "执行Step:", command.time, "方向:", DIRECTION_STR[obj.direction]);
			} else {
				// 丢包补偿
				obj.move(stepInterval);
				console.log("Step:", stepTime, obj.id, "补偿Step:", command.time, "方向:", DIRECTION_STR[obj.direction]);
			}
		}
		recvCommands = new Array();

		// 丢包暂停
		if(hasCurrentStepCommands) {
			isNetDelay = false;
		} else {
			isNetDelay = true;
			console.log("Step:", stepTime, "丢包，暂停游戏")
		}
	}

	// frame定时器
	var stepUpdateCounter = 0;
	function update(dt) {
		var now = getTime()
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
			if((now - gameStartTime) % stepInterval < 20) {
				console.log("游戏开始:", now);
				gameStatus = STATUS.START;
			}
		}
	}

	// 启动定时器
	var lastUpdate = Date.now();
	setInterval(function() {
		var now = Date.now();
		var dt = now - lastUpdate;
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