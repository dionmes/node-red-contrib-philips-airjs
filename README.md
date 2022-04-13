# node-red-contrib-philips-airjs
NodeRed node for Philips Air purifier in js.

# What is AirJS ?

This is a node for Node-Red to view the status and send commands to some Philips Air purifiers that use the COAP protocol.
It is based on project by @biemond (https://github.com/biemond/com.athom.philipsair.git )
and @betaboon ( https://github.com/betaboon/aioairctrl.git ).

Previous support in NodeRed for COAP based Philips Air purifiers is done via nodes that bridge 'aioairctrl' and these are not native JS implementations, they use Python.

# Configuration

In the IP/Host property of the node put in the IP address or Hostname to connect to the air purifier.

# Usage

The Node will observe and receive status message with all the current state information from the device. The output 
of these message is in JSON format with topic 'status', content will depend on your device type.

## Commands
The input of the node accepts two type of commands.

### Node control commands
'Observe' and 'Stop'. These will start and stop observing the device.

### Device control commands
These are device specific commands.

Format: key value (example: pwr 0 is off).

If succesful a message will be sent to the output with topic 'command' and payload {"status":"success"}
(This means that the command has been received by the device, not that it is executed. An incompatible or not understood command can still have status of success).<br>
In case of failure the payload will be an error message.

**Some commands (device specific):**

Modes (Manual, Auto, Turbo, sleep)
> mode M,
> mode AG,
> mode T,
> mode S

Fan speed
> om 1, 
> om 2

Power On/Off
> pwr 1,
> pwr 0

Child lock On, Off
> cl True,
> cl False

Buttons light: ON, Off
> uil 1,
> uil 0

Other devices might have more and other commands. 
For some devices you first need to set manual before adjusting fan speed.

## Status
The output json object is also device specific. Here are some of the outputs I use.

om - Fan speed
pwr - Power
cl - Child loc
aqil - Light brightness: 100
uil -Buttons light
mode - Mode
pm25 - PM25
iaql - Allergen
tvoc - tvoc
fltt1 - HEPA filter type
fltt2 - Active carbon filter
fltsts0 - Pre-filter and Wick: clean in ? hours
fltsts1 - HEPA filter: replace in ? hours
fltsts2 - Active carbon filter: replace in ? hours

## Compatibility
The node has been tested on an AC3039. 

It should be compatible with more Philips Air purifiers with COAP support like :
- AC1214
- AC2729
- AC2889
- AC2939
- AC3059
- AC3829
- AC3858
- AC4236

