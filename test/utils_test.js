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
    it('should make deep copies of non-connection objects', function(){
      var server      = new EventEmitter(),
          deepCopySpy = sinon.spy(utils, 'deepCopy');

      utils.deepEmit(server, 'test', { connection: {}, a: {}, b: {} });
      
      assert(deepCopySpy.calledTwice);
    });

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
  });
});
