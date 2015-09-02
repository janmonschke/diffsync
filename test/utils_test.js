var assert        = require('assert'),
    sinon         = require('sinon'),
    EventEmitter  = require('events').EventEmitter,
    utils         = require('../index').utils;

describe('DiffSync Utils', function(){
  describe('deepCopy', function(){
    it('should make a deep copy', function(){
      var obj = utils.deepCopy({ a: { b: true }, c: function() {} });
      assert.deepEqual(obj.a, { b: true });
      assert.equal(obj.c, undefined);
    });
  });

  describe('deepEmit', function(){
    it('should emit the event', function(){
      var server      = new EventEmitter(),
          emitSpy     = sinon.spy(server, 'emit'),
          listenerSpy = sinon.spy();

      server.on('test', listenerSpy);
      utils.deepEmit(server, 'test');

      assert(emitSpy.called);
      assert(emitSpy.calledWith('test'));
      assert(listenerSpy.calledOnce);
    });

    it('should make deep copies of non-connection objects', function(){
      var server      = new EventEmitter(),
          emitSpy     = sinon.spy(server, 'emit'),
          listenerSpy = sinon.spy(),
          connection  = { a: function() {} },
          other_arg   = { b: function() {}, c: true };

      server.on('test', listenerSpy);
      utils.deepEmit(server, 'test', { connection, other_arg });
      
      assert(emitSpy.called);
      assert.deepEqual(emitSpy.args[0][1].connection, connection);
      assert.deepEqual(emitSpy.args[0][1].other_arg,  { c: true });
      assert(listenerSpy.calledOnce);
    });
  });
});
