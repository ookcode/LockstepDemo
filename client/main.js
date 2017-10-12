// 方向枚举
var DIRECTION = {
	STOP:1,
	UP:2,
	DOWN:3,
	LEFT:4,
	RIGHT:5
}

// 游戏状态枚举
var STATUS = {
	WAIT:1,
	START:2
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
	// 所有游戏对象
	var gameObjects = {}
	// 自己的ID
	var myPlayerId = null;

	// 连接socket
	socket = io.connect('http://localhost:3000');

	// socket连接成功
	socket.on('open', function(id) {
		myPlayerId = id;
		console.log("Socket连接成功：",id);
	});

	// 收到游戏开始时间
	socket.on('start',function(json) {
		// 初始化GameObject
		for(var i = 0; i < json.player.length; ++i) {
			var id = json.player[i];
			gameObjects[id] = new GameObject(id);
		}
		gameStartTime = json.time;
		console.log("游戏预计开始时间:", gameStartTime);
	});

	// 收到游戏结束消息
	socket.on('over',function(json) {
		console.log("其他玩家离开游戏，游戏结束！")
		gameObjects = {};
		inputDirection = null;
		recvCommands = new Array();
		stepTime = 0;
		gameStartTime = 0;
		gameStatus = STATUS.WAIT;
		$('#ready').show();
		context.clearRect(0, 0, 600, 400);
	});

	// 收到指令
	socket.on('message',function(json){
		// 储存收到的指令
		recvCommands = recvCommands.concat(json);
	});

	// 断开连接
	socket.on('disconnect',function(){
		console.log("与服务器断开连接！")
	});

	// 发送指令
	function sendCommand() {
		// 模拟30ms的正常网络延迟
		var direction = inputDirection;
		var time = stepTime;
		setTimeout(function(){
			socket.emit("message", {
				direction: direction,
				time:time,
			});
		}, 30);
	}

	// step定时器
	function stepUpdate() {
		stepTime++;
		if(stepTime == 1) {
			return;
		}
		// 执行指令
		for(var i = 0; i < recvCommands.length; ++i) {
			var command = recvCommands[i];
			var obj = gameObjects[command.id];
			if(command.direction) {
				obj.direction = command.direction;
			}
		}
		recvCommands = new Array();
	}

	// frame定时器
	var stepUpdateCounter = 0;
	function update(dt) {
		var now = Date.now();
		if(gameStatus == STATUS.START) {
			stepUpdateCounter += dt;
			if(stepUpdateCounter >= stepInterval) {
				stepUpdate();
				stepUpdateCounter -= stepInterval;
			}
			context.clearRect(0, 0, 600, 400);
			for(var key in gameObjects) {
				var obj = gameObjects[key];
				obj.move(dt)
				context.fillStyle = "#000000";
				context.fillRect(obj.x, obj.y, 30, 30);
			}
		} else if(gameStartTime != 0 && now > gameStartTime) {
			console.log("游戏开始:", now);
			gameStatus = STATUS.START;
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

	// 发送准备消息
	$('#ready').click(function(){
		if(myPlayerId == null) {
			console.log("连接服务器失败！");
			return;
		}
		$('#ready').hide();
		socket.emit("join");
	});
});