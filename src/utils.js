module.exports = {
  deepCopy: function(obj){
    return JSON.parse(JSON.stringify(obj));
  }
};
