// 필요한 모듈 불러오기
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS 설정 및 소켓 경로('/ws') 강제 설정을 위한 Socket.IO 서버 생성
const io = new Server(server, {
  path: '/ws', // ⭐ 소켓 경로를 /ws로 명시
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 클라이언트 정적 파일 서빙 설정
app.use(express.static(path.join(__dirname, '..', 'client')));

// ----------------------------------------------------
// 경매 상태 및 변수 초기화
// ----------------------------------------------------
const MIN_START_PRICE = 50;
const BID_INCREMENT = 10;
const AUCTION_DURATION_SEC = 10;
const SNIPING_THRESHOLD = 5;
const TIME_EXTENSION = 5;

let auctionStatus = 'WAITING_FOR_READY';
let currentPrice = MIN_START_PRICE;
let highestBidder = '없음'; 
let timerRemaining = AUCTION_DURATION_SEC;
let auctionInterval;
const users = {};
const readyStatus = {};

// ----------------------------------------------------
// 사용자 목록 전송 함수
// ----------------------------------------------------
function sendUserList() {
    const userList = Object.values(users);
    io.emit('updateUserList', userList); 
    console.log('현재 접속 사용자 수:', userList.length);
    io.emit('updateReadyStatus', readyStatus);
}

// ----------------------------------------------------
// 경매 상태 전송 함수
// ----------------------------------------------------
function sendAuctionState(socket = io) {
    socket.emit('updateAuctionState', {
        status: auctionStatus,
        price: currentPrice,
        bidder: highestBidder,
        timer: timerRemaining 
    });
}

// ----------------------------------------------------
// 경매 타이머 관리 함수
// ----------------------------------------------------
function startAuctionTimer() {
    auctionStatus = 'ACTIVE';
    sendAuctionState();

    if (auctionInterval) {
        clearInterval(auctionInterval);
    }
    
    timerRemaining = AUCTION_DURATION_SEC;

    auctionInterval = setInterval(() => {
        timerRemaining--;
        
        io.emit('updateTimer', timerRemaining);

        if (timerRemaining <= 0) {
            clearInterval(auctionInterval);
            auctionStatus = 'ENDED';
            io.emit('auctionEnd', { winner: highestBidder, finalPrice: currentPrice });
            console.log(`경매 종료! 낙찰자: ${highestBidder}, 최종가: ${currentPrice}P`);
        }
    }, 1000);
}

// ----------------------------------------------------
// Socket.IO 이벤트 핸들링
// ----------------------------------------------------
io.on('connection', (socket) => {
  console.log('새로운 사용자 접속:', socket.id);
  
  sendUserList(); 

  // 1. 닉네임 설정 이벤트 처리
  socket.on('setNickname', (nickname) => {
    users[socket.id] = nickname;
    readyStatus[socket.id] = false; 
    console.log(`사용자 ${socket.id}가 닉네임 "${nickname}"으로 설정됨.`);
    
    sendUserList(); 
    
    socket.emit('nicknameSetSuccess', { 
        nickname: nickname,
        auctionState: {
            status: auctionStatus,
            price: currentPrice,
            bidder: highestBidder,
            timer: timerRemaining 
        }
    });
  });
  
  // 2. 준비 버튼 이벤트 처리
  socket.on('toggleReady', () => {
    if (!users[socket.id]) return;

    readyStatus[socket.id] = !readyStatus[socket.id];
    
    sendUserList();
    
    const readyCount = Object.keys(users).filter(id => readyStatus[id]).length;
    const totalUsers = Object.keys(users).length;
    
    const allUsersReady = totalUsers > 0 && readyCount === totalUsers;

    if (allUsersReady && auctionStatus === 'WAITING_FOR_READY') {
        console.log("모든 사용자가 준비됨. 경매 시작!");
        startAuctionTimer();
    }
  });

  // 3. 입찰 이벤트 처리 (스나이핑 방지 로직 포함)
  socket.on('bid', (bidAmount) => {
    const bidderNickname = users[socket.id];

    if (!bidderNickname || auctionStatus !== 'ACTIVE') {
      socket.emit('bidFailed', '입찰할 수 없는 상태입니다.');
      return;
    }

    const minBidAmount = currentPrice + BID_INCREMENT; 
    
    if (bidAmount >= minBidAmount) {
      currentPrice = bidAmount;
      highestBidder = bidderNickname;
      
      // 스나이핑 방지 (시간 연장) 로직
      if (timerRemaining <= SNIPING_THRESHOLD) {
          timerRemaining = TIME_EXTENSION;
          console.log(`[시간 연장] 경매 시간 ${TIME_EXTENSION}초로 연장됨.`);
      }
      
      sendAuctionState();

      console.log(`새로운 입찰: ${bidAmount}P (입찰자: ${highestBidder})`);
    } else {
      socket.emit('bidFailed', `최소 입찰 금액은 ${minBidAmount}P 입니다.`);
    }
  });

  // 4. 접속 해제 이벤트
  socket.on('disconnect', () => {
    console.log('사용자 접속 해제:', socket.id);
    delete users[socket.id]; 
    delete readyStatus[socket.id]; 
    
    sendUserList();
    
    if (Object.keys(users).length === 0 && auctionStatus === 'ACTIVE') {
        clearInterval(auctionInterval);
        auctionStatus = 'WAITING_FOR_READY';
        currentPrice = MIN_START_PRICE;
        highestBidder = '없음';
        timerRemaining = AUCTION_DURATION_SEC;
        console.log("모든 사용자 접속 해제로 경매 초기화됨.");
        sendAuctionState();
    }
  });
});

// 서버 리스닝
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`http://localhost:${PORT} 에 접속하여 테스트하세요.`);
});