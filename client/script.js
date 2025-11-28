// 서버 연결
// 🚨 Railway 등 외부 서버 배포 시: const socket = io('https://[YOUR_RAILWAY_URL].up.railway.app');
// 💻 로컬 테스트 시: const socket = io('http://localhost:3000');
const socket = io('http://localhost:3000'); 

// HTML 요소 선택
const nicknameSectionEl = document.getElementById('nicknameSection');
const auctionSectionEl = document.getElementById('auctionSection');
const nicknameInputEl = document.getElementById('nicknameInput');
const nicknameErrorEl = document.getElementById('nicknameError');
const myNicknameEl = document.getElementById('myNickname');

const currentPriceEl = document.getElementById('currentPrice');
const highestBidderEl = document.getElementById('highestBidder');
const bidInputEl = document.getElementById('bidInput');
const messageAreaEl = document.getElementById('messageArea');
const timerEl = document.getElementById('timer');

const userListEl = document.getElementById('userList');
const userCountEl = document.getElementById('userCount');

const auctionStatusDisplayEl = document.getElementById('auctionStatusDisplay');
const readyButtonEl = document.getElementById('readyButton');
const plusTenButtonEl = document.getElementById('plusTenButton');

let userNickname = ''; 
let currentHighestPrice = 0; // 현재 최고 입찰가를 저장 (계산용)
let myReadyStatus = false; // 나의 준비 상태

// ----------------------------------------------------
// 사용자 닉네임 설정 함수
// ----------------------------------------------------
function setNickname() {
    const nickname = nicknameInputEl.value.trim();
    if (nickname.length < 2 || nickname.length > 10) {
        nicknameErrorEl.textContent = '닉네임은 2자 이상 10자 이하여야 합니다.';
        return;
    }
    userNickname = nickname;
    myNicknameEl.textContent = userNickname; 
    socket.emit('setNickname', userNickname);
    nicknameErrorEl.textContent = '서버 응답 대기 중...';
}

// ----------------------------------------------------
// 준비 버튼 토글 함수
// ----------------------------------------------------
function toggleReady() {
    socket.emit('toggleReady');
}

// ----------------------------------------------------
// +10P 입찰 버튼 함수
// ----------------------------------------------------
function bidPlusTen() {
    if (!userNickname) {
        messageAreaEl.textContent = '먼저 닉네임을 설정해야 합니다.';
        return;
    }
    
    // 현재 최고가 + 10P를 계산하여 입찰 
    const bidAmount = currentHighestPrice + 10;
    submitBid(bidAmount);
}

// ----------------------------------------------------
// 사용자 입찰 함수
// ----------------------------------------------------
function submitBid(amount = null) {
    if (!userNickname) {
        messageAreaEl.textContent = '먼저 닉네임을 설정하고 입장해야 합니다.';
        return;
    }
    
    const bidAmount = amount !== null ? amount : parseInt(bidInputEl.value, 10);

    if (isNaN(bidAmount) || bidAmount <= 0) {
        messageAreaEl.textContent = '유효한 금액을 입력해주세요.';
        return;
    }
    
    // 서버로 입찰 금액 전송
    socket.emit('bid', bidAmount);
    if (amount === null) bidInputEl.value = ''; // 직접 입력 시에만 초기화
}

// ----------------------------------------------------
// Socket.IO 이벤트 수신
// ----------------------------------------------------

// 1. 닉네임 설정 성공 시 화면 전환 및 초기 상태 설정
socket.on('nicknameSetSuccess', (data) => {
    // 닉네임이 성공적으로 서버에 등록된 경우에만 화면 전환
    nicknameSectionEl.style.display = 'none';
    auctionSectionEl.style.display = 'block';
    nicknameErrorEl.textContent = ''; 
    
    // 초기 경매 상태 업데이트
    const auctionData = data.auctionState;
    currentHighestPrice = auctionData.price;
    currentPriceEl.textContent = `${auctionData.price.toLocaleString()}P`;
    highestBidderEl.textContent = auctionData.bidder; 
    timerEl.textContent = `${auctionData.timer}초`;
    
    let statusText = auctionData.status === 'WAITING_FOR_READY' ? '준비 중 (모두 준비해야 시작)' : '경매 상태';
    auctionStatusDisplayEl.textContent = statusText;
    
    const isActive = auctionData.status === 'ACTIVE';
    bidInputEl.disabled = !isActive;
    document.querySelector('button[onclick="submitBid()"]').disabled = !isActive;
    plusTenButtonEl.disabled = !isActive;
    readyButtonEl.disabled = isActive || auctionData.status === 'ENDED';
});


// 2. 서버로부터 경매 상태 업데이트 수신 (입찰 발생 시)
socket.on('updateAuctionState', (data) => {
    currentHighestPrice = data.price; 

    currentPriceEl.textContent = `${data.price.toLocaleString()}P`;
    highestBidderEl.textContent = data.bidder; 
    messageAreaEl.textContent = ''; 
    
    let statusText = '';
    const isActive = data.status === 'ACTIVE';
    
    switch (data.status) {
        case 'WAITING_FOR_READY':
            statusText = '준비 중 (모두 준비해야 시작)';
            break;
        case 'ACTIVE':
            statusText = '진행 중';
            break;
        case 'ENDED':
            statusText = '종료';
            break;
    }
    auctionStatusDisplayEl.textContent = statusText;

    // 경매 상태에 따라 입찰 버튼 활성화/비활성화
    bidInputEl.disabled = !isActive;
    document.querySelector('button[onclick="submitBid()"]').disabled = !isActive;
    plusTenButtonEl.disabled = !isActive;
    readyButtonEl.disabled = isActive || data.status === 'ENDED';
});

// 3. 서버로부터 타이머 업데이트 수신
socket.on('updateTimer', (remainingTime) => {
    timerEl.textContent = `${remainingTime}초`;
});

// 4. 서버로부터 경매 종료 수신
socket.on('auctionEnd', (data) => {
    timerEl.textContent = '종료';
    currentPriceEl.textContent = `${data.finalPrice.toLocaleString()}P`;
    highestBidderEl.textContent = data.winner;
    
    if (data.winner === userNickname) {
        messageAreaEl.textContent = `🎉 축하합니다! 최종 낙찰자입니다! (최종가: ${data.finalPrice.toLocaleString()}P)`;
        messageAreaEl.style.color = 'green';
    } else {
        messageAreaEl.textContent = `경매 종료! 최종 낙찰자는 ${data.winner}입니다.`;
        messageAreaEl.style.color = 'blue';
    }
});

// 5. 서버로부터 준비 상태 맵 수신 및 내 상태 업데이트
socket.on('updateReadyStatus', (readyStatusMap) => {
    const socketId = socket.id;
    myReadyStatus = !!readyStatusMap[socketId]; 
    readyButtonEl.textContent = myReadyStatus ? '준비 완료 (취소)' : '준비 완료 (시작)';
});

// 6. 서버로부터 사용자 목록 수신
socket.on('updateUserList', (userList) => {
    userCountEl.textContent = userList.length; 
    userListEl.innerHTML = ''; 

    userList.forEach(nickname => {
        const listItem = document.createElement('li');
        let displayNickname = nickname;
        
        if (nickname === userNickname) {
            displayNickname += myReadyStatus ? ' (나/준비)' : ' (나/미준비)';
            listItem.classList.add(myReadyStatus ? 'ready' : 'not-ready');
        } else {
            // 다른 사람의 준비 상태는 현재 서버 구조상 정확히 매칭하기 어렵습니다. 
            displayNickname += ' (?)'; 
        }

        listItem.textContent = displayNickname;
        userListEl.appendChild(listItem);
    });
});


// 7. 입찰 실패 메시지 수신
socket.on('bidFailed', (message) => {
    messageAreaEl.textContent = `[입찰 실패] ${message}`;
    messageAreaEl.style.color = 'red';
});