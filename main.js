const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
let drawing = false;
let peerConnection, dataChannel, ws;
let room = '';

function drawLine(x0, y0, x1, y1, color='black', emit=false) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.closePath();
  if (emit && dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({x0, y0, x1, y1, color}));
  }
}

canvas.addEventListener('mousedown', e => {
  drawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
});
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseout', () => drawing = false);
canvas.addEventListener('mousemove', e => {
  if (!drawing) return;
  drawLine(lastX, lastY, e.offsetX, e.offsetY, 'black', true);
  [lastX, lastY] = [e.offsetX, e.offsetY];
});

function setupWebRTC(isInitiator) {
  peerConnection = new RTCPeerConnection();
  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel('whiteboard');
    setupDataChannel();
  } else {
    peerConnection.ondatachannel = event => {
      dataChannel = event.channel;
      setupDataChannel();
    };
  }
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', room, payload: event.candidate }));
    }
  };
}

function setupDataChannel() {
  dataChannel.onmessage = event => {
    const {x0, y0, x1, y1, color} = JSON.parse(event.data);
    drawLine(x0, y0, x1, y1, color);
  };
}

document.getElementById('join').onclick = () => {
  room = document.getElementById('room').value;
  if (!room) return alert('Enter a room name!');
  ws = new WebSocket('wss://YOUR_RENDER_URL_HERE'); // <-- Replace with your Render.com WebSocket URL
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room }));
    setupWebRTC(true);
    peerConnection.createOffer().then(offer => {
      peerConnection.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'offer', room, payload: offer }));
    });
  };
  ws.onmessage = async (msg) => {
    const { type, payload } = JSON.parse(msg.data);
    if (type === 'offer') {
      setupWebRTC(false);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'answer', room, payload: answer }));
    } else if (type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
    } else if (type === 'candidate') {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(payload));
      } catch (e) {}
    }
  };
};

let lastX, lastY; 