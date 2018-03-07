var server = require('http').Server()
var io = require('socket.io')(server)

var g_onlines = {} // 所有在线玩家
var g_commands = new Array() // 指令数组
var g_commands_histroy = new Array() // 历史指令，用于断线重连
var g_joinCount = 0 // 已准备的人数
var g_maxJoinCount = 2 // 最大人数
var g_stepTime = 0 // 当前step时间戳
var g_stepInterval = 100 // 每个step的间隔ms

// 游戏状态枚举
var STATUS = {
	WAIT:1,
	START:2
}
var g_gameStatus = STATUS.WAIT

io.on('connection', function (socket) {
	socket.emit("open", {id:socket.id, stepInterval:g_stepInterval})

	// 获取用户账户
	function getAccount(socketId) {
		for(var key in g_onlines) {
			if(socketId == g_onlines[key].socket.id) {
				return key
			}
		}
	}

	socket.on('join', function(account) {
		// 顶号/断线重连
		if(g_onlines[account]) {
			g_onlines[account].socket.emit('system', "被顶号了")
			g_onlines[account].socket.disconnect()
			if(g_gameStatus == STATUS.START) {
				g_onlines[account] = {socket: socket, online: true}
				socket.emit('join', {result:true, message:"正在断线重连..."})
				console.log(account, "重连游戏")
				socket.broadcast.emit('system', account + "重新连接！")
				socket.emit('start', {player:Object.keys(g_onlines)})
				socket.emit('message', g_commands_histroy)
				return
			}
		}
		// 房间已满
		if(g_joinCount == g_maxJoinCount) {
			console.log("房间已满", account, "加入失败")
			socket.emit('system', "房间已满")
			socket.disconnect()
			return
		}
		// 加入游戏
		if(g_joinCount < g_maxJoinCount) {
			console.log(account, "加入游戏")
			socket.emit('join', {result:true, message:"匹配中..."})
			g_onlines[account] = {socket: socket, online: true}
			g_joinCount++
		}
		// 开始游戏
		if(g_joinCount == g_maxJoinCount) {
			g_commands = new Array()
			g_commands_histroy = new Array()
			g_gameStatus = STATUS.START
			io.sockets.emit('start', {player:Object.keys(g_onlines)})
		}
	})

	socket.on('timeSync', function(time) {
		socket.emit('timeSync', {client:time, server:Date.now()})
	})

	socket.on('message', function(json) {
		if(g_gameStatus == STATUS.START) {
			// TODO:过滤高延迟的包 (json.step)
			json.id = getAccount(socket.id)
			if(json.id) {
				g_commands.push(json)
			}
		}
	})

	socket.on('disconnect', function () {
		var account = getAccount(socket.id)
		if(account) {
			g_onlines[account].online = false
			console.log(account, "离开游戏")
			var isGameOver = true
			for(var key in g_onlines) {
				if(g_onlines[key].online) {
					isGameOver = false
				}
			}
			if(isGameOver) {
				io.sockets.emit('system', "游戏结束")
				g_joinCount = 0
				g_stepTime = 0
				g_gameStatus = STATUS.WAIT
				g_onlines = {}
				console.log("游戏结束")
			} else {
				io.sockets.emit('system', account + "离开了游戏！")
			}
		}
	})
})

// step定时器
function stepUpdate() {
	// 过滤同帧多次指令
	var message = {}
	for(var key in g_onlines) {
		message[key] = {step:g_stepTime, id:key}
	}
	for(var i = 0; i < g_commands.length; ++i) {
		var command = g_commands[i]
		command.step = g_stepTime
		message[command.id] = command
	}
	g_commands = new Array()

	// 发送指令
	var commands = new Array()
	for(var key in message) {
		commands.push(message[key])
	}
	g_commands_histroy.push(commands)
	for(var key in g_onlines) {
		g_onlines[key].socket.emit('message', new Array(commands))
	}
}

// frame定时器
var stepUpdateCounter = 0
function update(dt) {
	var now = Date.now()
	if(g_gameStatus == STATUS.START) {
		stepUpdateCounter += dt
		if(stepUpdateCounter >= g_stepInterval) {
			g_stepTime++
			stepUpdate()
			stepUpdateCounter -= g_stepInterval
		}
	}
}

// 启动定时器
var lastUpdate = Date.now()
setInterval(function() {
	var now = Date.now()
	var dt = now - lastUpdate
	lastUpdate = now
	update(dt)
})

// 监听3000端口
server.listen(3000, function(){
	console.log("服务器启动成功，监听端口3000")
})