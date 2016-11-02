
var Parse = require('./parse');

module.exports = startSocketServer;


/**
 * 扩展数组的升序排序
 */
Array.prototype.OrderByAsc = function (func) {
    var m = {};
    for (var i = 0; i < this.length; i++) {
        for (var k = 0; k < this.length; k++) {
            if (func(this[i]) < func(this[k])) {
                m = this[k];
                this[k] = this[i];
                this[i] = m;
            }
        }
    }
    return this;
}

/**
 * 扩展数组的降序排序
 */
Array.prototype.OrderByDesc = function (func) {
    var m = {};
    for (var i = 0; i < this.length; i++) {
        for (var k = 0; k < this.length; k++) {
            if (func(this[i]) > func(this[k])) {
                m = this[k];
                this[k] = this[i];
                this[i] = m;
            }
        }
    }
    return this;
}

function startSocketServer(server) {

    var io = require('socket.io')(server);

    /**
     * 正在游戏中玩家列表
    */
    const InGameUsers = new Map();

    /**
     * 时间常量
    */
    const SPEAK_SECONDS = 40;
    const WOLF_SECONDS = 15;
    const WIZARD_SECONDS = 15;
    const HUNTER_SECONDS = 10;
    const POLICE_SECONDS = 10;
    const VOTE_SECONDS = 15;



//--------------------------------------房间内部管理模块----------------------------------------------------->   

    /**
     * 创建玩家
     */
    function createUser(userId, socket) {
        const users = this.users;
        let ready = false;
        try {
            const user = this.findUser(userId);
            user.socket = socket;
        } catch (e) {
            users.push({ userId, socket, ready, dead: false, type: -1 });
            console.log('in room ' + this.roomId + '  creating user ' + userId);
        }

    }
    
    /**
     * 查找玩家
    */
    function findUser(userId) {
        const user = this.users.find(user => user.userId === userId);
        if (!user)
            throw new Error("用户未找到" + "  roomId= " + this.roomId + " userId " + userId);
        return user;
    }
    

    /**
     * 销毁玩家
    */
    function destroyUser(userId) {
        const user = this.findUser(userId);
        const userIndex = this.users.indexOf(user);
        this.users.splice(userIndex, 1);
        console.log('in room ' + this.roomId + '  destroying user ' + userId + ' at index ' + userIndex);
    }


    /**
     * 玩家准备
    */
    function readyUser(userId) {
        this.findUser(userId).ready = true;        
        console.log('in room ' + this.roomId + ' ' + userId + '  prepared..');
    }
    
    /**
     * 玩家取消准备
    */
    function unreadyUser(userId) {
        this.findUser(userId).ready = false;        
        console.log('in room ' + this.roomId + ' ' + userId + '  unprepared..');
    }

    /**
     * 获取所有玩家的准备信息
    */
    function fetchUsers() {
        return this.users.map(user => {
            const {userId, ready} = user;
            return { userId, ready };
        });
    }    

    /**
     * 获取存活的狼人
    */
    function getWolves() {
        return this.users.filter(user => user.type === 1 && user.dead === false);
    }
    

    /**
     * 获取所有狼人的Id
    */
    function fetchWolfIds() {
        return this.users.filter(user => user.type === 1).map(wolf => wolf.userId);
    }

    /**
     * 洗牌
    */
    function shuffle() {
        const shuffled_types = this.types.sort(() => Math.random() > 0.5);
        console.log('shuffled types are : ' + shuffled_types);
        this.users.forEach((user, index) => {
            user.type = shuffled_types[index];
            InGameUsers.set(user.userId, this);
        });
    }
    
    /**
     * 选择下一位发言玩家
    */
    function chooseNextSpeakUser() {
        this.speakUsers = this.users.filter(user => !user.dead);
        this.currentSpeakerIndex = 0;
    }
    
    /**
     * 设置游戏阶段
    */
    function setPeriod(period) {
        this.period = period;
    }

    
    /**
     * 狼人杀人结果的计算
    */
    function getWolfResult() {        
        this.killUserId = undefined;
        let maxCount = 0;
        let maxUserId;
        console.log('狼人投票结果：', this.vote)
        for (userId in this.vote) {
            if (this.vote[userId] > maxCount) {
                maxCount = this.vote[userId]
                maxUserId = userId
            }
        }
        if (maxUserId) {
            console.log('狼人投票结果： 今晚要杀的人的Id是 ' + maxUserId)
        } else {
            console.log('狼人投票结果： 今晚谁都不杀')
        }
        const voteRecord = this.voteRecord;
        this.killUserId = maxUserId;
        //计算完之后记得清空
        this.vote = {};
        this.voteRecord = [];
        return [
            maxUserId,
            voteRecord
        ];
    }

    /**
     * 晚上结果的计算
    */
    function getDarkResult() {        
        let maxUserId = this.killUserId;
        let finalUserId;
        let poisonUserId = this.wizardPoisonUserId;
        if (maxUserId) {
            finalUserId = maxUserId;
            if (this.guardProtectUserId && this.guardProtectUserId === maxUserId) {
                console.log('守卫今晚守护了狼人要杀的人！')
                finalUserId = undefined;
            }
            if (this.wizardSaveUserId && this.wizardSaveUserId === maxUserId) {                
                if (this.guardProtectUserId === maxUserId) {
                    finalUserId = maxUserId
                } else {
                    finalUserId = undefined;
                }
            }
        }

        //重置
        this.wizardPoisonUserId = undefined;
        this.wizardSaveUserId = undefined;
        this.guardProtectUserId = undefined;

        if (finalUserId === poisonUserId)
            return [null, finalUserId];
        return [
            finalUserId,
            poisonUserId
        ];
    }


    /**
     *警长投票结果的计算
    */
    function getPoliceResult() {        
        let maxCount = 0;
        let maxUserId;
        for (userId in this.vote) {
            if (this.vote[userId] > maxCount) {
                maxCount = this.vote[userId]
                maxUserId = userId
            }
        }
        if (maxUserId) {
            console.log('白天投票结果： 白天当选警长的是：' + maxUserId)
        } else {
            console.log('白天没有投出警长');
        }
        let voteRecord = this.voteRecord;
        //计算完之后记得清空
        this.vote = {};
        this.voteRecord = [];
        return [
            maxUserId,
            voteRecord
        ];
    }


    /**
     * 白天结果的计算
    */
    function getLightResult() {       
        let maxCount = 0;
        let maxUserId;
        for (userId in this.vote) {
            if (this.vote[userId] > maxCount) {
                maxCount = this.vote[userId]
                maxUserId = userId
            }
        }
        if (maxUserId) {
            console.log('白天投票结果： 白天要出局的人的Id是 ' + maxUserId)
        } else {
            console.log('白天投票结果： 白天没有人出局')
        }
        let voteRecord = this.voteRecord;
        //计算完之后记得清空
        this.vote = {};
        this.voteRecord = [];
        return [
            maxUserId,
            voteRecord
        ];
    }

//<--------------------------------------房间内部管理模块-----------------------------------------------------   


//--------------------------------------房间列表管理模块----------------------------------------------------->


    /**
     * 房间列表
    */
    const rooms = [];
    let roomIndex = 0;


    /**
     * 创建房间
    */
    function createRoom(name, socket, wizard, predictor, guard, hunter, wolf_count, citizen_count) {//{0: 村民，1：狼人，2：预言家，3：女巫，4：守卫，5：猎人}
        let types = [];
        if (wizard)
            types.push(3);
        if (predictor)
            types.push(2);
        if (guard)
            types.push(4);
        if (hunter)
            types.push(5);
        for (let i = 0; i < wolf_count; i++)
            types.push(1);
        for (let i = 0; i < citizen_count; i++)
            types.push(0);
        const roomId = "" + roomIndex++;
        const room = {
            roomId, name, maxCount: types.length, currentCount: 0, users: [], types, period: undefined,
            langrenRoom: 'langrenRoom' + roomId,
            policeId: undefined, policeDead: false, hasVotePolice: false,newPoliceId:undefined,
            voteRecord: [], vote: {},
            hasPoisoned: false, hasSaved: false, wizardSaveUserId: undefined, wizardPoisonUserId: undefined,huntedUserId:undefined,
            guardProtectUserId: undefined, lastGuardedUserId: undefined,
            speakUsers: [], currentSpeakerIndex: -1, currentSpeakerTimer: undefined,
            leaveWordsCounter: 0, leaveWordsTotalCount: 4,
            darkResult: [], lightResult: [], policeResult: [],
            createUser, findUser, destroyUser, readyUser, unreadyUser, fetchUsers, fetchWolfIds, getWolves, shuffle, chooseNextSpeakUser, setPeriod,getDarkResult,getWolfResult,getPoliceResult,getLightResult

        };
        rooms.push(room);
        socket.join(roomId);
        console.log('creating room ', room);
        return room;
    }
    


    /**
     * 查找房间
    */
    function findRoom(roomId) {
        const room = rooms.find(room => room.roomId === roomId);
        if (!room)
            throw new Error("房间未找到" + "  roomId = " + roomId);
        return room;
    }


    /**
     * 销毁房间
    */
    function destroyRoom(roomId) {
        const room = findRoom(roomId);
        const roomIndex = rooms.indexOf(room);
        rooms.splice(roomIndex, 1);
        console.log('destroying room ' + roomId + ' at index ' + roomIndex);
    }
    

    /**
     * 重置房间
    */
    function resetRoom(roomId) {
        const room = findRoom(roomId);
        //让狼人离开他们的聊天室
        room.users.filter(user => user.type === 1).forEach(wolf => wolf.socket.leave(room.langrenRoom));
        const disconnectedUsers = [];
        room.users.forEach(user => {
            user.type = -1;
            user.dead = false;
            InGameUsers.delete(user.userId);
            if (!user.socket.connected) {
                disconnectedUsers.push(user.userId);
            }

        });

        //离线玩家直接踢出房间
        disconnectedUsers.forEach(userId => {
            console.log('reset room and user ' + userId + ' is disconnected, so kick him out directly');
            if (room.users.length === 1) //最后一个人,直接删除房间，并通知所有登录用户
            {
                console.log('the room ' + roomId + ' has only one person,destroy it directly');
                destroyRoom(roomId);
                msg.emit('destroyRoom', roomId);
            } else {
                room.destroyUser(userId);
                msg.to(roomId).emit('leaveRoom', userId);
                room.currentCount--;
                msg.emit('roomChange', roomId, -1);
            }
        });
        const index = rooms.findIndex(room => room.roomId === roomId);
        rooms[index] = Object.assign(room,
            {
                period: undefined,
                policeId: undefined, policeDead: false, hasVotePolice: false,newPoliceId:undefined,
                voteRecord: [], vote: {},
                hasPoisoned: false, hasSaved: false, wizardSaveUserId: undefined, wizardPoisonUserId: undefined,huntedUserId:undefined,
                guardProtectUserId: undefined, lastGuardedUserId: undefined,
                speakUsers: [], currentSpeakerIndex: -1, currentSpeakerTimer: undefined,
                leaveWordsCounter: 0, leaveWordsTotalCount: 4,
                darkResult: [], lightResult: [], policeResult: [],
            });

    };


//<--------------------------------------房间列表管理模块-----------------------------------------------------


//--------------------------------------通信模块----------------------------------------------------->
    const msg = io.of('/msg').on('connection', function (socket) {

        console.log("socket id " + socket.id + ' connection...');

        /**
         * 游戏错误
        */
        socket.on('error', function (error) {
            console.log('in server error handle...' + 'error: ', error);
            socket.emit('serverError', error.message);
        });


        /**
         * 断开连接
        */
        socket.on('disconnect', function () {
            try {
                console.log("socket id " + socket.id + ' disconnection...')
                const roomId = socket.roomId;
                const userId = socket.userId;
                socket.leave(roomId);    // 退出房间
                if (roomId && !InGameUsers.get(userId)) {
                    console.log('user ' + userId + " is leaving within a room");
                    const room = findRoom(roomId);
                    if (room.users.length === 1) //最后一个人,直接删除房间，并通知所有登录用户
                    {
                        console.log('the room ' + roomId + ' has only one person,destroy it directly');
                        destroyRoom(roomId);
                        msg.emit('destroyRoom', roomId);
                    } else {
                        room.destroyUser(userId);
                        //通知房间其他人      
                        msg.to(roomId).emit('leaveRoom', userId);
                        findRoom(roomId).currentCount--;
                        msg.emit('roomChange', roomId, -1);
                    }
                } else if (roomId && InGameUsers.get(userId)) {
                    console.log('user ' + userId + ' disconnected and he is playing a game in room ' + roomId);
                }
            }
            catch (e) {
                socket.emit("error", e);
            }
        });



        /**
         * 登录
        */
        socket.on('login', function (userId) {
            console.log("userid " + userId + "...login...");
            socket.userId = userId;
            //用户登录进来，给他看当前有哪些房间   
            socket.emit('login', rooms.map(room => {
                const {roomId, name, currentCount, maxCount,types} = room;
                return { roomId, name, currentCount, maxCount,types };
            }));
            //用户已在游戏中，额外将游戏状态发给他
            const room = InGameUsers.get(userId);
            if (room) {
                console.log(userId + ' alreadyInRoom in room ', room.roomId);
                socket.emit('alreadyInRoomTag');
                setTimeout(() => socket.emit('alreadyInRoom', room.roomId), 1000);
            }
        });


        /**
         * 创建房间
        */
        socket.on('createRoom', function (name, wizard, predictor, guard, hunter, wolf_count, citizen_count) {
            //先创建一个空房间
            const room = createRoom(name, socket, wizard, predictor, guard, hunter, wolf_count, citizen_count);
            //所有登录用户需要知道房间被创建
            socket.broadcast.emit('newRoom', room.roomId, room.name, room.currentCount, room.maxCount,room.types);
            socket.emit('createRoom', room.roomId, room.name, room.currentCount, room.maxCount,room.types);
        });





        /**
         * 加入房间
         */
        socket.on('enterRoom', function (roomId, userId) {
            try {
                if (userId === null) {
                    socket.emit('error', "userid为空！");
                    return;
                }
                const room = findRoom(roomId);
                try {
                    //已经在房间里
                    const user = room.findUser(userId);
                    console.log(`${userId} reEnterRoom ${roomId}`);
                    socket.roomId = roomId;
                    socket.join(roomId);
                    //将用户加入房间
                    console.log(socket.rooms);
                    room.createUser(userId, socket);
                    console.log(room.fetchUsers());
                    //告诉用户房间所有人的信息  {userId,ready}
                    socket.emit('enterRoom', room.fetchUsers());
                    socket.emit('alreadyInGameTag');
                    setTimeout(() => socket.emit('alreadyInGame'), 1000);
                }
                catch (e) {
                    console.log(`${userId} enter room ${roomId}`);
                    if(room.currentCount===room.maxCount){
                        socket.emit('roomError',"房间已满");
                        return;
                    }
                    socket.roomId = roomId;
                    socket.join(roomId);
                    //将用户加入房间
                    console.log(socket.rooms);
                    room.createUser(userId, socket);
                    console.log(room.fetchUsers());
                    room.currentCount++;
                    msg.emit('roomChange', roomId, 1);
                    //告诉其他人有人进来了
                    socket.broadcast.to(roomId).emit('joinRoom', userId);
                    //告诉用户房间所有人的信息  {userId,ready}
                    socket.emit('enterRoom', room.fetchUsers());
                }

            } catch (e) {
                socket.emit("roomError", "房间已经不存在");
            }

        });


        /**
         * 离开房间
        */
        socket.on('leaveRoom', function (roomId, userId) {
            try {

                if (userId === null) {
                    socket.emit('error', "userid为空！");
                    return;
                }
                console.log(`${userId} leave room ${roomId}`);
                socket.roomId = undefined;
                const room = findRoom(roomId);
                socket.leave(roomId);
                InGameUsers.delete(userId);
                if (findRoom(roomId).users.length === 1) //最后一个人,直接删除房间，并通知所有登录用户
                {
                    console.log('the room ' + roomId + ' has only one person,destroy it directly');
                    destroyRoom(roomId);
                    msg.emit('destroyRoom', roomId);
                } else {
                    room.destroyUser(userId);
                    msg.to(roomId).emit('leaveRoom', userId);
                    room.currentCount--;
                    msg.emit('roomChange', roomId, -1);
                }
            } catch (e) {
                socket.emit('error', e);
            }
        });


        /**
         * 准备
        */
        socket.on('prepare', function (roomId, userId) {
            try {
                const room = findRoom(roomId);
                if (room.findUser(userId).ready)
                    return;
                room.readyUser(userId);
                msg.to(roomId).emit('prepare', userId);
                if (room.users.filter(user=>user.ready).length === room.maxCount) {
                    console.log('game will start .....');
                    msg.to(roomId).emit('willstart');
                    setTimeout(function () {
                        room.shuffle();
                        console.log('game start!');
                        room.users.forEach(user => {
                            user.socket.emit('start', user.type);
                            if (user.type === 1) {
                                user.socket.join(room.langrenRoom);
                                user.socket.emit('company', room.fetchWolfIds().filter(wolfId => wolfId != user.userId))
                            }
                        });
                        gameDarkPeriod(room);
                    }, 1500);
                }
            } catch (e) {
                socket.emit('error', e);
            }
        });


        /**
         * 取消准备
        */
        socket.on('unprepare', function (roomId, userId) {
            try {
                const room = findRoom(roomId);
                if (!room.findUser(userId).ready)
                    return;
                room.unreadyUser(userId);
                msg.to(roomId).emit('unprepare', userId);
            } catch (e) {
                socket.emit('error', e);
            }
        });


        /** 
         * 重新加入游戏
        */
        socket.on("reJoinGame", function (roomId, userId) {
            console.log(`${userId} reJoinGame ${roomId}`);
            const room = findRoom(roomId);
            const user = room.findUser(userId);
            let companys = [];
            if (user.type === 1) {
                socket.join(room.langrenRoom);
                companys = room.fetchWolfIds().filter(wolfId => wolfId != userId);
            }

            const {hasSaved, hasPoisoned, lastGuardedUserId, policeId, users} = room;
            const isFromDark = room.period <= 2;
            socket.emit("reJoinGame", {
                hasSaved, hasPoisoned, lastGuardedUserId, policeId,
                users: users.map(user => {
                    const {userId, dead} = user;
                    return { userId, dead };
                })
            }, companys, isFromDark, user.type);
        });


        /**
         * 发言
         */
        socket.on('blob', function (roomId, blob) {
            socket.broadcast.to(roomId).emit('blob', blob);
        });


        //狼人聊天室
        socket.on('langrenMsg', function (roomId, userId, message) {
            console.log('langrenMsg: ' + message)
            msg.to(findRoom(roomId).langrenRoom).emit('langrenMsg', userId, message)
        });



        /**
         * 狼人自爆
         */
        socket.on('wolfDestroy', function (roomId, wolfId) {
            const room = findRoom(roomId);
            const wolf = room.findUser(wolfId);
            if (!wolf)
                throw new Error('狼人自爆: 没有找到该狼人');
            wolf.dead = true;
            msg.to(roomId).emit('wolfDestroy', wolfId);
            clearTimeout(room.currentSpeakerTimer);
            setTimeout(function () {
                if (gameOverJudgePeriod(room))
                    return;
                gameDarkPeriod(room);
            }, 1000);
        });




        /**
         * 狼人杀人
        */
        socket.on('wolf', function (roomId, fromUserId, toKillUserId) {
            const room = findRoom(roomId);
            if (toKillUserId) {
                console.log('狼人  ' + fromUserId + ' 选择击杀 ' + toKillUserId);
                room.voteRecord.push({ fromUserId, toUserId: toKillUserId })
                room.vote[toKillUserId] ? room.vote[toKillUserId]++ : room.vote[toKillUserId] = 1;
            } else {
                console.log('狼人  ' + fromUserId + ' 没有击杀任何人');
            }
        });



        /**
         * 选警长
        */
        socket.on('votePolice', function (roomId, fromUserId, toUserId) {
            const room = findRoom(roomId);
            if (toUserId) {
                console.log('选警长时   ' + fromUserId + ' 投给了 ' + toUserId);
                room.voteRecord.push({ fromUserId, toUserId })
                room.vote[toUserId] ? room.vote[toUserId]++ : room.vote[toUserId] = 1;
            } else {
                console.log('选警长时  ' + fromUserId + ' 没有投给任何人');
            }

        });



        /**
         * 票坏人
        */
        socket.on('voteWolf', function (roomId, fromUserId, toUserId) {
            const room = findRoom(roomId);
            if (toUserId) {
                console.log('投票出局阶段 ' + fromUserId + ' 投给了 ' + toUserId)
                room.voteRecord.push({ fromUserId, toUserId })
                room.vote[toUserId] ? room.vote[toUserId]++ : room.vote[toUserId] = 1;
                if (fromUserId === room.policeId)
                    room.vote[toUserId] = room.vote[toUserId] + 0.5;
            } else {
                console.log('用户  ' + fromUserId + ' 没有投给任何人');
            }

        });



        /**
         * 女巫
         */
        socket.on('wizard', function (roomId, saveUserId, poisonUserId) {
            const room = findRoom(roomId);
            if (saveUserId && !room.hasSaved) {
                console.log("女巫用了解药");
                room.wizardSaveUserId = saveUserId;
                room.hasSaved = true;
            }
            if (poisonUserId && !room.hasPoisoned) {
                console.log("女巫毒了" + poisonUserId);
                room.wizardPoisonUserId = poisonUserId;
                room.hasPoisoned = true;
            }
        });



        /**
         * 预言家
         */
        socket.on('predictor', function (roomId, toCheckUserId) {
            if (toCheckUserId) {
                const room = findRoom(roomId);
                socket.emit("predictorMsg", room.findUser(toCheckUserId).type === 1 ? 1 : 0);
            }
        });

        /**
         * 守卫
        */
        socket.on('guard', function (roomId, guardProtectUserId) {
            const room = findRoom(roomId);
            if (guardProtectUserId) {
                console.log("守卫今晚守卫了 " + guardProtectUserId);
                if (room.lastGuardedUserId) {
                    if (room.lastGuardedUserId === guardProtectUserId) {
                        socket.emit("error", new Error('守卫不能连续两个夜晚守护同一个人'))
                    } else {
                        room.guardProtectUserId = guardProtectUserId;
                    }
                } else {
                    room.guardProtectUserId = guardProtectUserId;
                }
            }
            room.lastGuardedUserId = guardProtectUserId;

        });


        /**
         * 猎人
         */
        socket.on('hunter', function (roomId, huntedUserId) {
            const room = findRoom(roomId);
            if (huntedUserId) {
                room.findUser(huntedUserId).dead = true;
                room.huntedUserId = huntedUserId;
            }
        });


        /**
         * 警长
        */
        socket.on('deliverPolice', function (roomId, newPoliceId) {  //移交警徽永远是在晚上死的
            const room = findRoom(roomId);
            room.newPoliceId = newPoliceId;
            room.policeId = newPoliceId;
        });


        /**
         * 遗言
         */
        socket.on("leaveWordsFinished", function (roomId, isFromDark) {
            const room = findRoom(roomId);
            clearTimeout(room.currentSpeakerTimer);
            gamePoliceDeadPeriod(room, isFromDark);
        });

        /**
         * 过麦
        */
        socket.on('pass', function (roomId) {
            try {
                const room = findRoom(roomId);
                clearTimeout(room.currentSpeakerTimer);
                passSpeak(room);
            } catch (e) {
                socket.emit('error', e);
            }
        });

    });

//<--------------------------------------通信模块-----------------------------------------------------

    
//--------------------------------------游戏逻辑模块----------------------------------------------------->

    /**
     * 天黑
    */
    function gameDarkPeriod(room) {        
        room.darkResult= [];
        room.lightResult=[];
        room.policeResult=[];
        setTimeout(function () {
            room.setPeriod(0);
            console.log("天黑");
            msg.to(room.roomId).emit('dark');
            const {hasSaved, hasPoisoned, lastGuardedUserId} = room;
            msg.to(room.roomId).emit('roomInfo', hasSaved, hasPoisoned, lastGuardedUserId);
            setTimeout(() => wolfActionPeriod(room), 1000);
        }, 1500);
    }

    /**
    *  狼人投票(17秒)
    */
    function wolfActionPeriod(room) {
        room.setPeriod(1);
        console.log("狼人行动");
        const users = room.users;
        //给狼人发消息
        users.filter(user => user.type === 1 && user.dead === false).forEach(wolf => wolf.socket.emit('action'));
        //预言家和守卫如果死了是不碍事的，这时候不给他们发消息就是,但他们只有十秒的时间，而这十秒在狼人的15秒之内，如果他们掉线，并不会影响游戏进程
        const predictor = users.find(user => user.type === 2);
        if (predictor && !predictor.dead) {
            predictor.socket.emit('action');
        }
        const guard = users.find(user => user.type === 4);
        if (guard && !guard.dead) {
            guard.socket.emit('action');
        }

        setTimeout(() => gameWolfResultPeriod(room), 17000);
    }

    /**
     * 宣布狼人投票结果
    */
    function gameWolfResultPeriod(room) {
        room.wolfResult = room.getWolfResult();
        msg.to(room.langrenRoom).emit('wolfResult', ...room.wolfResult);   
        if(room.users.filter(user=>!user.dead).length===2){
            const wizard = room.users.find(user => user.type === 3);
            if(wizard && !wizard.dead && room.wolfResult[0]===wizard.userId && room.hasSaved){
                   wizard.dead = true;
                   if(gameOverJudgePeriod(room)){
                       console.log("极限情况：场上只有一狼一女巫，而且女巫解药已经用了，当晚狼刀了女巫，游戏结束");
                       return;
                   }else{
                       throw new Error("我的逻辑怎么可能出错？");
                   }
            }
        }
        wizardActionPeroid(room);
    }

    /**
     * 女巫行动(17秒)
    */
    function wizardActionPeroid(room) {
        room.setPeriod(2);
        console.log("女巫行动");
        const wizard = room.users.find(user => user.type === 3);
        //没有女巫，直接天亮
        if (!wizard) {
            setTimeout(()=>gameLightPeriod(room), 5000);            
            return;
        }
        //女巫死了,假装发消息
        if (wizard && wizard.dead) {
            room.wizardHasActioned = true;
            setTimeout(function () {
                gameLightPeriod(room);
            }, 17000);
            return;
        }
        if (wizard && !wizard.dead) {
            wizard.socket.emit('action');
            if (room.hasSaved) {
                console.log('女巫的解药用完了，不告诉她狼人杀了谁')
            } else {
                console.log('告诉女巫今晚杀了谁: ' + room.killUserId)
                setTimeout(function () {
                    wizard.socket.emit('wizard', room.killUserId);
                }, 1000);
            }

            setTimeout(() => gameLightPeriod(room), 17000);
        }

    }

    /**
     * 天亮
    */
    function gameLightPeriod(room) {
        room.setPeriod(3);
        console.log("天亮");
        msg.to(room.roomId).emit("light");
        setTimeout(() => gamePoliceJudgePeriod(room), 1000);
    }

    /**
     * 判断警长是否已选举并导向下一步
    */
    function gamePoliceJudgePeriod(room) {
        if (!room.hasVotePolice) {
            gameSpeakPeriod(room);
        }
        else {
            gameDarkResultPeriod(room);
        }
    }

    /**
     * 选警长(17秒)
    */
    function gameVotePolicePeriod(room) {
        msg.to(room.roomId).emit('votePolice');
        setTimeout(() => gamePoliceResultPeriod(room), 17000);
    }

    /**
     * 宣布警长结果
    */
    function gamePoliceResultPeriod(room) {
        room.hasVotePolice = true;
        room.policeResult = room.getPoliceResult();
        room.policeId = room.policeResult[0];
        msg.to(room.roomId).emit('policeResult', ...room.policeResult);
        setTimeout(function () {
            gameDarkResultPeriod(room);
        }, 5000);
    }

    /**
     * 票坏人(17秒)
    */
    function gameVoteWolfPeriod(room) {
        msg.to(room.roomId).emit('voteWolf');
        setTimeout(() => gameLightResultPeriod(room), 17000);
    }

    /**
     * 宣布白天结果
    */
    function gameLightResultPeriod(room) {
        console.log("宣布白天结果");
        room.lightResult = room.getLightResult();
        msg.to(room.roomId).emit('lightResult', ...room.lightResult);
        if (room.lightResult[0])
            room.findUser(room.lightResult[0]).dead = true;
        if (gameOverJudgePeriod(room))
            return;
        setTimeout(function () {
            msg.to(room.roomId).emit('come back');
            hunterActionPeriod(room, false);
        }, 5000);
    }

    /**
     * 宣布晚上结果
    */

    function gameDarkResultPeriod(room) {
        console.log("宣布晚上结果");
        room.darkResult = room.getDarkResult();
        msg.to(room.roomId).emit("darkResult", ...room.darkResult);
        if (room.darkResult[0])
            room.findUser(room.darkResult[0]).dead = true;
        if (room.darkResult[1])
            room.findUser(room.darkResult[1]).dead = true;
        if (gameOverJudgePeriod(room))
            return;
        setTimeout(() => hunterActionPeriod(room, true), 1000);
    }


    /**
     * 猎人阶段(12秒)
    */
    function hunterActionPeriod(room, isFromDark) {
        //没死人,或者是被毒死的,则直接跳过遗言及死亡技能阶段
        if (!getDeadMan(room, isFromDark)) {
            gameAfterLeaveWordsPeriod(room, isFromDark);
            return;
        }

        const hunter = room.users.find(user => user.type === 5);
        if (hunter) {
            console.log("猎人阶段");
            msg.to(room.roomId).emit('hunter');

            //如果猎人死了，就向猎人发消息
            if (hunter && ((isFromDark && room.darkResult[0] === hunter.userId) || (!isFromDark && room.lightResult[0] === hunter.userId))) {
                hunter.socket.emit("youHunterDead", isFromDark);
            }

            //12秒后自动跳到遗言阶段
            setTimeout(() => gameLeaveWordsPeriod(room, isFromDark), 12000);
        } else {
            gameLeaveWordsPeriod(room, isFromDark);
        }


    }



    /**
     * 遗言(42秒)
    */
    function gameLeaveWordsPeriod(room, isFromDark) {
        //告诉大家是否有人被枪杀
        if (room.huntedUserId) {
            msg.to(room.roomId).emit('hunterFinished', room.huntedUserId);
            room.findUser(room.huntedUserId).dead = true;

            if (gameOverJudgePeriod(room))
                return;
        }

        //如果遗言次数到顶，直接跳到警长阶段
        if (room.leaveWordsCounter >= 4) {
            console.log("遗言次数到顶");
            gamePoliceDeadPeriod(room, isFromDark);
            return;
        }

        console.log("遗言阶段");

        //死亡玩家发表遗言
        const deadman = getDeadMan(room, isFromDark);
        //如果用户掉线，则不发表遗言
        if (!deadman.socket.connected) {
            gameAfterLeaveWordsPeriod(room, isFromDark);
            return;
        }
        deadman.socket.emit("youLeaveWords", isFromDark);
        deadman.socket.broadcast.to(room.roomId).emit("leaveWords", deadman.userId);


        //42秒后如果没有结束发表遗言        
        room.currentSpeakerTimer = setTimeout(() => gamePoliceDeadPeriod(room, isFromDark), 42000);

    }

    /**
   *  警长发动死亡技能(12秒)
   */
    function gamePoliceDeadPeriod(room, isFromDark) {
        //遗言阶段全部结束
        msg.to(room.roomId).emit('leaveWordsFinished');
        //警长白天被票死不能发动技能
        if (!isFromDark) {
            gameAfterLeaveWordsPeriod(room, false);
            return;
        }

        //警长没有死
        const deadman = getDeadMan(room, isFromDark);
        if (deadman && deadman.userId != room.policeId) {
            gameAfterLeaveWordsPeriod(room, isFromDark);
            return;
        }


        console.log("警长移交警徽");

        //警长移交警徽
        room.policeDead = true;
        const police = deadman;
        police.socket.broadcast.to(room.roomId).emit("changePolice");
        police.socket.emit("deliverPolice");

        //12秒后自动跳到遗言后
        setTimeout(() => gameAfterLeaveWordsPeriod(room, isFromDark), 12000);
    }

    /**
     * 遗言结束
    */
    function gameAfterLeaveWordsPeriod(room, isFromDark) {
        //宣布新警长
        if (room.policeDead) {
            msg.to(room.roomId).emit('deliverPoliceFinished', room.newPoliceId);
            room.policeDead = false;
        }
        console.log("死亡处理阶段全部结束");
        setTimeout(function () {
            if (isFromDark) {
                gameSpeakPeriod(room);
            } else {
                gameDarkPeriod(room);
            }
        }, 1000);
    }

    /**
     * 发言(42秒)
     */
    function gameSpeakPeriod(room) {
        console.log("发言阶段")
        setTimeout(function () {
            msg.to(room.roomId).emit('startSpeak');
            setTimeout(function () {
                room.chooseNextSpeakUser(room);
                passSpeak(room);
            }, 1000);
        }, 1000);
    }


    /**
     * 游戏结束
    */
    function gameOverJudgePeriod(room) {
        if (isGameOver(room)) {
            //天亮后游戏结束
            console.log("游戏结束");
            setTimeout(function () {
                room.setPeriod(-1);
                try {
                    msg.to(room.roomId).emit("gameOver");
                    setTimeout(() => msg.to(room.roomId).emit("gameOverResult", gameResult(room)), 1500);
                } catch (e) {
                    msg.to(room.roomId).emit('serverError', e.message);
                }
                setTimeout(() => resetRoom(room.roomId), 3000);
            }, 2000);
            return true;
        }
        return false;
    }


    /**
     * 获取死亡玩家
    */
    function getDeadMan(room, isFromDark) {
        let deadmanId;
        if (isFromDark)
            deadmanId = room.darkResult[0];
        else
            deadmanId = room.lightResult[0];
        if (deadmanId)
            return room.findUser(deadmanId);
        else
            return null;
    }
    
    /**
     * 过麦
    */
    function passSpeak(room) {
        clearTimeout(room.currentSpeakerTimer);
        if (room.currentSpeakerIndex < room.speakUsers.length) {
            const user = room.speakUsers[room.currentSpeakerIndex++];
            if (user.socket.connected) {
                user.socket.broadcast.to(room.roomId).emit('speak', user.userId);
                user.socket.emit('youSpeak');
                //如果42秒后用户没有结束发言，证明其已掉线,则自动过麦
                room.currentSpeakerTimer = setTimeout(() => passSpeak(room), 42000);
            } else {
                passSpeak(room);
            }

        }
        else {
            msg.to(room.roomId).emit('endSpeak');
            setTimeout(function () {
                if (!room.hasVotePolice) {
                    gameVotePolicePeriod(room);
                } else {
                    gameVoteWolfPeriod(room);
                }
            }, 1000);
        }
    }
    
    /**
     * 游戏是否结束
    */
    function isGameOver(room) {
        const wolves = room.users.filter(user => user.type === 1 && !user.dead);
        const goodmen = room.users.filter(user => user.type != 1 && !user.dead);
        if (wolves.length === 0 || goodmen.length === 0)
            return true;
        return false;
    }
    
    /**
     * 游戏结果
    */
    function gameResult(room) {
        const wolves = room.users.filter(user => user.type === 1 && !user.dead);
        const goodmen = room.users.filter(user => user.type != 1 && !user.dead);
        if (wolves.length === 0 && goodmen.length === 0)
            throw new Error('好人坏人都死光了');
        if (wolves.length === 0) {
            const victory = 0;   //好人赢
            const aliveGoodmenCount = goodmen.length;
            let returnResults = room.users.map(user => {
                const {userId, type} = user;
                let score = 0;
                switch (type) {
                    case 0:
                        score = 1 * aliveGoodmenCount;
                        break;
                    case 1:
                        score = -4;
                        break;
                    default:
                        score = 2 * aliveGoodmenCount;
                }
                //将积分结果存入数据库
                const parseUser = new Parse.User();
                parseUser.id = userId;
                parseUser.increment("score", score);
                parseUser.save();
                return { userId, type, score }
            });
            returnResults.OrderByDesc(item => item.score);
            return { victory, returnResults }
        }
        else if (goodmen.length === 0) {
            const victory = 1;   //狼人赢
            const aliveWolfCount = wolves.length;
            let returnResults = room.users.map(user => {
                const {userId, type} = user;
                let score = 0;
                switch (type) {
                    case 0:
                        score = -1;
                        break;
                    case 1:
                        score = 3 * aliveWolfCount;
                        break;
                    default:
                        score = -2;
                }
                //将积分结果存入数据库
                const parseUser = new Parse.User();
                parseUser.id = userId;
                parseUser.increment("score", score);
                parseUser.save();
                return { userId, type, score }
            });

            returnResults.OrderByDesc(item => item.score);

            return { victory, returnResults }
        }
        else
            throw new Error('游戏错误，好人和坏人都没死光');
    }

//<--------------------------------------游戏逻辑模块-----------------------------------------------------




}


