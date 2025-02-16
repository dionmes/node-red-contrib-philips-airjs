module.exports = function(RED) {

	function AirPurifierNode(config) {

		const coap = require("node-coap-client").CoapClient;

		const crypto = require('crypto');
		const aesjs = require('aes-js');
		const pkcs7 = require('pkcs7');

		const port = '5683'
		const SECRET_KEY = "JiangPan";

		const statuspath = '/sys/dev/status';
		const syncpath = '/sys/dev/sync';
		const controlpath = '/sys/dev/control';

		RED.nodes.createNode(this,config);
		
		var urlprefix;
		var msgCounter = "";
		var should_observe = true;
		
		var node = this;
		
		node.log("Airjs node started.");
		
		node.host = config.host;
		
		if (node.host !== "") {

			var urlprefix = "coap://" + node.host + ":" + port;
			
			// Connect and observe
			// Sync device to connect
			syncDevice().catch( err => {
				node.error("AirJS sync failed. - " + err);
			});
			 
			// Register input events
			node.on('input', (msg, send, done) => {
				// Handle command
				receiveCommand(node, send,msg);

				// Node red done
				if (done) { done(); }
			});

			// Register close event
			node.on('close', function() {
				// Stop observing		
				coap.stopObserving(urlprefix + statuspath);
				// Reset connection
				coap.reset(urlprefix);
			});

		} else {
			node.error("IP/Host address not configured.");
			node.status({fill:"red",shape:"dot",text:"disconnected"});
		}
		
		//
		// function syncDevice()
		//
		// Sync device
		//
		function syncDevice(){
			
			return new Promise( (resolve, reject) => {
		
				const token = crypto.randomBytes(32).toString('hex').toUpperCase();

				// Stop observing
				coap.stopObserving(urlprefix + statuspath);
				// Reset connection
				coap.reset(urlprefix);

				// Sync Request
				coap.request(url = urlprefix + syncpath, method = "post", payload = Buffer.from(token,'utf-8'), options = {keepAlive: true, confirmable: true, retransmit: true})
				.then( response => {
				
					node.log("Airjs sync response received");

					try {		
						msgCounter = response.payload.toString('utf-8');
					} catch (err) {
						node.error("Airjs msg counter corrupt. : " + err);
						node.status({fill:"red",shape:"dot",text:"disconnected"});
						reject("Sync request failed, msg counter error.");
					}
			
					if (should_observe) {
						observe();
					}

					resolve();
				})
				.catch( err => {

					msgCounter = "";
					
					node.error("Disconnected, Airjs could not sync. : " + err);
					node.status({fill:"red",shape:"dot",text:"disconnected"});

					reject("Sync request failed.");
				})
			 })
		}

		//
		// Function observe()
		// Start observing the device
		// 
		function observe() {
			// Start observing
			coap.observe(
				url = urlprefix + statuspath, 
				method = "get", gotObserveResponse, "",
				options = {keepAlive: true, confirmable: false}
			).then ( () => {
				node.status({fill:"green",shape:"dot",text:"Observing"});
			})
			.catch( () => {
				node.status({fill:"red",shape:"circle",text:"Error observing"});
			});		
		}
		
		//
		// function gotObserveResponse(msg)
		// Method to be called by the coap client on receiving a response by observing the device
		// payload : object received by the coap client
		//
		// Method will handle the message and decrypt/parse the payload
		//
		function gotObserveResponse(input) {
		
			const response = input.payload.toString('utf-8');
			const unencryptedResponse = decryptPayload(response);

			if (unencryptedResponse !== "") {
				const jsonstring = unencryptedResponse.replace(/[\u0000-\u0019]+/g,"");		
				const json = JSON.parse(jsonstring);
			
				const msg = { topic: "status", payload: json.state.reported};
			
				node.send(msg);
			}
		}


		//
		// function receiveCommand(node, msg)
		// Handle commands received on node input.
		//
		function receiveCommand(node, send, msg) {

			try {
				var command = msg.payload.toString();
			} catch(error) {
				node.error("Command not recognized. ");
				return;			
			}
			
			// AirJS commands
			if ( command.toUpperCase() == "OBSERVE" ) {
				// Observe
				should_observe = true;
				observe();
				return; 
				
			} else if ( command.toUpperCase() == "STOP" ) {
				should_observe = false;
				coap.stopObserving(urlprefix + statuspath);
				node.status({fill:"yellow",shape:"ring",text:"Not observing"}); 
				return;
			} 
			
			// Device commands
			sendDeviceCommand(command);
		};
		
		//
		// function sendDeviceCommand(command)
		//
		// Send command/setting to device
		//
		function sendDeviceCommand(completeCommand) {
			
			const commandArray = completeCommand.split(' ');
			
			if (commandArray.length !== 2 ) {
				node.error("Command not well formatted. ");
				return;
			}
			
			const command = commandArray[0].toLowerCase(); 
			var commandValue = commandArray[1].toLowerCase();

			// Parse boolean string to boolean
			if (commandValue == "false" || commandValue == "true" ) {
				commandValue = (commandValue == "true") ? commandValue = true : false;
			}

			if ( command == "mode" || command == "func" ) {
				commandValue = commandValue.toUpperCase();
			}

			if ( command == "aqil" || command == "rhset" || command == "dt") {
				commandValue = parseInt(commandValue);
			}

			// Create command message
			var message = { state: { desired: { CommandType: 'app', DeviceId: '', EnduserId: '1' } } };
			message.state.desired[command] = commandValue;
			
			// Stop observing to send command
			coap.stopObserving(urlprefix + statuspath);

			// Response message
			const msg = { topic: "command", payload: "" };
			
			node.status({fill:"blue",shape:"dot",text:"Sending command"});	
			
			// Sync and then send command
			const unencryptedPayload = JSON.stringify(message);
			const encryptedPayload = encryptPayload(unencryptedPayload);
	
			coap.request(url = urlprefix + controlpath, method = "post", payload = Buffer.from(encryptedPayload), options = {keepAlive: true, confirmable: true})
			.then( response => {		
				if (response.payload) {
					
					const payload = response.payload.toString('utf-8');
					msg.payload = payload;
					node.send(msg);
					
					node.status({fill:"blue",shape:"dot",text:"Command send"});	

					if (should_observe) {
						observe();
					}
				} else {
					
					msg.payload = {"status": "Command response invalid : " + err };
					node.send(msg);
					node.status({fill:"red",shape:"dot",text:"Command error"});	

					if (should_observe) {
						observe();
					}
				}

			}).catch( err => {
				msg.payload = {"status": "Command failed to transmit : " + err };
				node.send(msg);
				node.status({fill:"red",shape:"dot",text:"Command failed"});	
			});			

		}

		//
		// function decryptPayload
		// Decrypt message payload
		//
		function decryptPayload(payload_encrypted) {

			const pe_length = payload_encrypted.length;
			const key = payload_encrypted.substring(0,8);
	
			const ciphertext = payload_encrypted.substring(8,pe_length-64);
			const digest = payload_encrypted.substring(pe_length-64);
			const digest_calculated = crypto.createHash('sha256').update(key + ciphertext).digest("hex").toUpperCase();

			if (digest == digest_calculated) {

				const key_and_iv = crypto.createHash('md5').update(Buffer.from((SECRET_KEY + key), 'utf-8')).digest("hex").toUpperCase();
				const half_keylen = key_and_iv.length / 2;
	
				const secret_key = key_and_iv.substring(0,half_keylen);
				const iv = key_and_iv.substring(half_keylen);
			
				const decipher = new aesjs.ModeOfOperation.cbc(Buffer.from(secret_key,'utf-8') , Buffer.from(iv,'utf-8'));
	
				const data = decipher.decrypt(Buffer.from(ciphertext, 'hex'));
				const plaintext = aesjs.utils.utf8.fromBytes(data);
	
				return plaintext;
		
			} else {
				node.error("Airjs, decryption calculated digest mismatch");
				return "";
			}
		}

		//
		// function encryptPayload
		// encrypt message payload
		//
		function encryptPayload(unencryptedPayload) {

			// Increase and encode msg counter
			increaseCounter();

			const key_and_iv = new crypto.createHash('md5').update(SECRET_KEY + msgCounter).digest('hex').toUpperCase();
	
			const key = key_and_iv.substring(0, key_and_iv.length / 2);
			const iv = key_and_iv.substring(key_and_iv.length / 2, key_and_iv.length);
			const data = pkcs7.pad(aesjs.utils.utf8.toBytes(unencryptedPayload));
	
			var cipher = new aesjs.ModeOfOperation.cbc(Buffer.from(key,'utf-8'), Buffer.from(iv,'utf-8'));
			var encryptedBytes = Buffer.from(cipher.encrypt(data)).toString('hex').toUpperCase(); 

			const hash = Buffer.from(crypto.createHash('sha256').update(msgCounter + encryptedBytes).digest('hex').toUpperCase());
	
			return msgCounter + encryptedBytes + hash;
		}
		
		//
		// function increaseCounter()
		// Increase counter and convert back to hex big endian.
		// 
		function increaseCounter() {

			var inbuffer = Buffer.from(msgCounter, 'hex');
			var counterint = inbuffer.readUInt32BE(0) + 1;

			const outbuffer = Buffer.allocUnsafe(4);
			outbuffer.writeUInt32BE(counterint, 0);

			msgCounter = outbuffer.toString('hex').toUpperCase();
	
			return
		}

	}
	
	RED.nodes.registerType("philips-airjs",AirPurifierNode);
}