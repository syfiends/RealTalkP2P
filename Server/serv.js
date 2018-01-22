var WebSocketServer = require('ws').Server;
var PORT_NUMBER = 8080;
var wss = new WebSocketServer({ port: PORT_NUMBER });
var connectedPeers = {};

wss.on('connection', function connection(ws) {
    console.log('Peer Successfully Connected');
    ws.on('message', function incoming(message) {
        var objMessage = JSON.parse(message);
        onMessage(ws, objMessage);
    });
});

console.log("Singaling channel active on port: " + PORT_NUMBER);
// the message handler
function onMessage(ws, message){
    var type = message.type;
    switch (type) {
		case "answer":
			onAnswer(message.answer, message.destination, ws.id);
			break;
        case "ICECandidate":
            onICECandidate(message.ICECandidate, message.destination, ws.id);
            break;
		case "init":
			onInit(ws, message.init);
			break;
        case "offer":
			onOffer(message.offer, message.destination, ws.id);
            break;
		case "retrievePeersId":
			onRetrievePeersId(message.retrievePeersId);
			break;
		default:
            throw new Error("Invalid message");
    }
}

function onAnswer(answer, destination, source){
	console.log("Peer:", source, "and Peer:", destination, "Successfully connected");
	connectedPeers[destination].send(JSON.stringify({
		type: 'answer',
		answer: answer,
		source: source,
	}));
}

function onICECandidate(ICECandidate, destination, source){
	connectedPeers[destination].send(JSON.stringify({
		type: 'ICECandidate',
		ICECandidate: ICECandidate,
		source: source,
	}));
}

function onInit(ws, id){
    console.log("Offer from Peer:", id);
    ws.id = id;
	ws.onclose = function() {
		delete connectedPeers[id];
	}
    connectedPeers[id] = ws;
    connectedPeers[id].send(JSON.stringify({
        type:'init',
    }));;
}

function onOffer(offer, destination, source){
    console.log("Offer from peer:", source, "to peer", destination);
    connectedPeers[destination].send(JSON.stringify({
        type:'offer',
        offer:offer,
        source:source,
    }));
}

function onRetrievePeersId(id){
	var currentPeersId = [];
	Object.keys(connectedPeers).map(function(peerId, index) {
		if (peerId != id) {
			currentPeersId.push(peerId);
		}
	})
    connectedPeers[id].send(JSON.stringify({
		type: 'retrievePeersId',
		retrievePeersId: currentPeersId,
	}));
}

module.exports = onMessage;

