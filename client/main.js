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

	// 初始化UI显示
	$("#content").hide();
	$("#login").show();
	$("#tips").hide();

	// 连接socket
	socket = io.connect('http://120.78.185.209:3000');
	// socket = io.connect('http://127.0.0.1:3000');

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
		gameStatus = STATUS.START;
		stepTime = 0;
		console.log("游戏开始");
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
		recvCommands.push(json.commands);
		stepTime = json.step
	});

	// 收到历史指令
	socket.on('remessage',function(json){
		recvCommands = recvCommands.concat(json);
	});

	// 对时
	socket.on('timeSync',function(json) {
		var client = json.client;
		var server = json.server;
		var delay = Date.now() - client; // 网络延迟
		$("#lag").text("延迟：" + delay + "ms")
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
	}

	// frame定时器
	var stepUpdateCounter = 0;
	function update(dt) {
		if(gameStatus == STATUS.START) {
			stepUpdateCounter += dt;
			if(stepUpdateCounter >= stepInterval) {
				stepUpdate();
				stepUpdateCounter -= stepInterval;
			}
			var scale = 1;
			if(recvCommands.length > 2) {
				scale = 2;
			}
			if(recvCommands.length > 0) {
				var frame = recvCommands[0];
				var ms = dt * scale;
				if(frame.ms == undefined) frame.ms = stepInterval;
				if(frame.ms < ms) ms = frame.ms
				for (var i = 0; i < frame.length; i++) {
					var command = frame[i];
					console.log(command);
					var obj = gameObjects[command.id];
					if(command.direction) {
						obj.direction = command.direction;
					}
					obj.move(ms)
				}
				frame.ms = frame.ms - ms
				if(frame.ms == 0) {
					recvCommands.shift();
				}
			}
			context.clearRect(0, 0, 600, 400);
			for(var key in gameObjects) {
				var obj = gameObjects[key];
				context.fillStyle = "#000000";
				context.fillRect(obj.x, obj.y, 30, 30);
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