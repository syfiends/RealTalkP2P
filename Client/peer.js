function initPeer(messageCallback){
    var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
    var RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    var RTCIceCandidate = window.RTCIceCandidate ;
    var webss = "ws://localhost:8080/";
    var servers = {Servers: [{urls: "stun:stun.1.google.com:19302"}]}; //// usinggoogle's stun server to avoid setting up one myself for now
    var signalingChannel = createSignalingChannel(PEER_ID);
	// channel object
	window.channels = {};


	signalingChannel.onInit = function () {

		signalingChannel.retrievePeersId(PEER_ID);
	};

	signalingChannel.onOffer = function (offer, source) {
// recieve offer
		var peerConnection = createPeerConnection(source);
		peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
		peerConnection.createAnswer(function(answer){
			peerConnection.setLocalDescription(answer);
// recieve answer
			signalingChannel.sendAnswer(answer, source);
		}, function (e){
			console.error(e);
		});
	};

	// Multiple peer connection support added, retrieves slist of peers from the server
	signalingChannel.onRetrievePeersId = function (currentPeersId) {
		console.log('peer id:', currentPeersId);
		if (currentPeersId.length !== 0) {
			// Establishes the communication with each peer
            recStartCommunication(currentPeersId);
		} else {
			console.log("No connected peers");
		}
	};

	// Adding peers to DOM
	function addpeer(peerId) {
		var peerForm = document.getElementById('peers');
		var peerdiv = document.createElement('div');
		var peerElem = document.createElement('p');
		var peerinput = document.createElement('input');

        peerinput.setAttribute('type', 'radio');
        peerinput.setAttribute('name', 'peer');
        peerinput.setAttribute('value', peerId);
        peerElem.appendChild(peerinput);



        var text = document.createTextNode(peerId);
		peerElem.appendChild(text);

		var peermsg = document.createElement('p');
		peermsg.setAttribute('id', peerId);

		peerdiv.appendChild(peerElem);
		peerdiv.appendChild(peermsg);
		peerForm.appendChild(peerdiv);
	}

	function removepeer(peerId) {
		var rmv = document.getElementById(peerId).parentNode;
		rmv.parentNode.removeChild(rmv);
	}

	function createPeerConnection(peerId){
        var pc = new RTCPeerConnection(servers, {
            optional: [{
                DtlsSrtpKeyAgreement: true
            }]
        });

        pc.onicecandidate = function (evt) {
            if(evt.candidate){
                signalingChannel.sendICECandidate(evt.candidate, peerId);
            }
        };

        signalingChannel.onICECandidate = function (ICECandidate, source) {
            pc.addIceCandidate(new RTCIceCandidate(ICECandidate));
        };
// add and recieve peers when new channels are opened/closed
        pc.ondatachannel = function(event) {
			var receiveChannel = event.channel;
			// Adds the received channel to the channels object
			window.channels[peerId] = receiveChannel;

			receiveChannel.onclose = function(evt) {
				delete window.channels[peerId];
				removepeer(peerId);
			}

			receiveChannel.onmessage = function(event){
				messageCallback(event.data, peerId);
			};

			receiveChannel.onopen = function(){
				addpeer(peerId);
	        };
        };

        return pc;
    };

	// Starts communication with a peer given his/her id.
    function recStartCommunication(peersId) {
		if (peersId.length === 0) {
			return;
		}

		var peerId = peersId.pop();

        var pc = new RTCPeerConnection(servers, {
            optional: [{
                DtlsSrtpKeyAgreement: true
            }]
        });

        signalingChannel.onAnswer = function (answer, source) {
            pc.setRemoteDescription(new RTCSessionDescription(answer));
        };

        signalingChannel.onICECandidate = function (ICECandidate, source) {
            pc.addIceCandidate(new RTCIceCandidate(ICECandidate));
        };

        pc.onicecandidate = function (evt) {
            if(evt.candidate){
                signalingChannel.sendICECandidate(evt.candidate, peerId);
            }
        };

        //:warning the dataChannel must be opened BEFORE creating the offer.
        var commChannel = pc.createDataChannel('communication', {
            reliable: false
        });

        pc.createOffer(function(offer){
            pc.setLocalDescription(offer);
            signalingChannel.sendOffer(offer, peerId);
        }, function (e){
            console.error(e);
        });

		// now that a new channel was made lets add it to the object
		window.channels[peerId] = commChannel;

		commChannel.onclose = function(evt) {
			delete window.channels[peerId];
			removePeerFromDOM(peerId);
        };

        commChannel.onopen = function(){
            addpeer(peerId);
			recStartCommunication(peersId);
        };

        commChannel.onmessage = function(message){
            messageCallback(message.data, peerId);
        };
    }

	// Establishes the communication with the signaling channel
	signalingChannel.connectToTracker(webss);
}

// SIGNALING CHANNEL:

function SignalingChannel(id){

    var websocket;
    var self = this;

    function connectToTracker(url){
        websocket = new WebSocket(url);
        websocket.onopen = onConnectionEstablished;
        websocket.onmessage = onMessage;
    }

    function onConnectionEstablished(){
        sendMessage("init", id);
    }


    function onMessage(evt){
        var objMessage = JSON.parse(evt.data);
        switch (objMessage.type) {
            case "answer":
                self.onAnswer(objMessage.answer, objMessage.source);
                break;
            case "ICECandidate":
                self.onICECandidate(objMessage.ICECandidate, objMessage.source);
                break;
            case "init":
                self.onInit();
                break;
            case "offer":
                self.onOffer(objMessage.offer, objMessage.source);
                break;
            case "retrievePeersId":
                self.onRetrievePeersId(objMessage.retrievePeersId);
                break;
            default:
                throw Error("invalid message type");
        }
    }

    function sendMessage(type, data, destination){
        var message = {};
        message.type = type;
        message[type] = data;
        message.destination = destination;
        websocket.send(JSON.stringify(message));
    }

    function retrievePeersId(source){
        sendMessage("retrievePeersId", source, null);
    }

    function sendAnswer(answer, destination){
        sendMessage("answer", answer, destination);
    }

    function sendICECandidate(ICECandidate, destination){
        sendMessage("ICECandidate", ICECandidate, destination);
    }

    function sendOffer(offer, destination){
        sendMessage("offer", offer, destination);
    }

    this.connectToTracker = connectToTracker;
    this.sendAnswer = sendAnswer;
    this.sendICECandidate = sendICECandidate;
    this.sendOffer = sendOffer;
    this.retrievePeersId = retrievePeersId;

}

window.createSignalingChannel = function(id){
    var signalingChannel = new SignalingChannel(id);
    return signalingChannel;
};

