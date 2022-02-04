/**

	Node Red Node for Phillips Air purifier in native JS
	Heavily based on the implementation for Homey by @biemond
	
	Disclaimer: I am not a JS developer, so this has been hacked together without any professional development methods and tools
	
**/

const coap = require("node-coap-client").CoapClient;

const crypto = require('crypto');
const aesjs = require('aes-js');
const pkcs7 = require('pkcs7');

const util = require('util');

const ip = '192.168.133.226';
const port = '5683'
const SECRET_KEY = "JiangPan";

const statuspath = '/sys/dev/status';
const syncpath = '/sys/dev/sync';
const controlpath = '/sys/dev/control';

var msgCounter = "";

var urlprefix = "coap://" + ip + ":" + port;

//
//
// Main loop
//
//
var connected = false;

coap.tryToConnect(urlprefix + statuspath)
.then((result) => {
	connected = true;
	console.log("Connected");
}).catch( err => {
	connected = false;
	console.log("Not Connected");
});  


console.log("Status " + connected);

/**
syncDevice().then( () => {
		console.log("Observing")
		coap.observe(url = urlprefix + statuspath, method = "get", gotResponse, "", options = {keepAlive: false, confirmable: false});	
	})
	.catch( err => {
		console.log("Error sync.");
	})

setTimeout(function() { 
	console.log("Time is now!");
	sendCommand("!");
}, 2000);
**/

//
// function syncDevice()
//
// Sync device		
//
function syncDevice(){
	return new Promise( (resolve, reject) => {

		const token = crypto.randomBytes(32).toString('hex').toUpperCase();
		// Sync Request
		coap.request(url = urlprefix + syncpath, method = "post", payload = Buffer.from(token,'utf-8'), options = {keepAlive: true, confirmable: false})
		.then( response => {

			try {		
				msgCounter = response.payload.toString('utf-8');
				console.log("Counter from sync: " + msgCounter);
				
			} catch (error) {
				console.log("Counter error " + error);
				msgCounter = "";
			}
			
			resolve();
		})
		.catch( err => {
			console.log("Error " + err);
			msgCounter = "";
			
			reject();
			
		} )
	 })
}

//
// function sendCommand(command)
//
// Send command/setting to device
//
function sendCommand(command) {

	console.log("Stop observing. " + urlprefix + statuspath);
	coap.stopObserving(urlprefix + statuspath);

	syncDevice().then( () => {

		console.log("Send control");	
		 
		var key = 'uil';
		var value = '0';

		var message = {
					state: {
						desired: {
							CommandType: 'app',
							DeviceId: '',
							EnduserId: '1',
							uil: '1'
						}
					}
				};
	
		//    (message.state.desired)[key] = value;

		const unencryptedPayload = JSON.stringify(message);
		const encryptedPayload = encryptPayload(unencryptedPayload);
		
		coap.request(url = urlprefix + controlpath, method = "post", payload = Buffer.from(encryptedPayload), options = {keepAlive: false, confirmable: true})
		.then( response => {		
			if (response.payload) {
				const payload = response.payload.toString('utf-8');
				console.log(payload);
			} else {
				throw new Error('No response received for call. Cannot proceed');
			}
		}).catch( err => {
			console.log("Control error " + err);
		});         

	})
	.catch( err => {
		console.log("Error sync. " + err);
	})
}

//coap.stopObserving(urlprefix + statuspath);

//
// function gotResponse(msg)
// Method to be called by the coap client on receiving a response by observing the device
// msg : object received by the coap client
//
// Method will handle the message and decrypt/parse the payload
//
function gotResponse(msg) {
		
	const response = msg.payload.toString('utf-8');

	var unencryptedResponse = decryptPayload(response);
	let json = parseResponse(unencryptedResponse);
	
	console.log(json.state.reported.name);
	
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
		console.log("Calculated digest mismatch;");
		process.exit(0);
	}
	
}

//
// function encryptPayload
// encrypt message payload
//
function encryptPayload(unencryptedPayload) {

	// Increase and encode msg counter
	console.log("Counter before update (hex): " + msgCounter );
	increaseCounter(msgCounter);
	console.log("Updated counter (hex) : " + msgCounter );

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
// function parseResponse
// Clean up response data and parse to json
//
function parseResponse(data) {

	data = data.replace(/[\u0000-\u0019]+/g,""); 
	console.log(JSON.parse(data));
	
	return JSON.parse(data);
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
