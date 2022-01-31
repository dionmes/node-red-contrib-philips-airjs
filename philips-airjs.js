module.exports = function(RED) {
    function AirPurifierNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        
        node.on('input', function(msg) {
            msg.payload = "AirPurifier Node active";
            node.send(msg);
        });
    
    }
    RED.nodes.registerType("philips-airjs",AirPurifierNode);
}
