var strtok = require('strtok2');
var parser = require('./id3v2_frames');
var common = require('./common');

module.exports = function (stream, callback, done) {
  strtok.parse(stream, function (v, cb) {
    if (!v) {
      cb.state = 0;
      return new strtok.BufferType(10);
    }

    switch (cb.state) {
      case -1: // skip
        cb.state = 2;
        return readFrameHeader(cb.header.major);
      case 0: // header
        if (v.toString('ascii', 0, 3) !== 'ID3') {
          return done(new Error('expected id3 header but was not found'));
        }

        cb.header = {
          version: '2.' + v[3] + '.' + v[4],
          major: v[3],
          unsync: common.strtokBITSET.get(v, 5, 7),
          xheader: common.strtokBITSET.get(v, 5, 6),
          xindicator: common.strtokBITSET.get(v, 5, 5),
          footer: common.strtokBITSET.get(v, 5, 4),
          size: common.strtokINT32SYNCSAFE.get(v, 6)
        };

        if (cb.header.xheader) {
          cb.state = 1;
          return strtok.UINT32_BE;
        }

        // expect the first frames header next
        cb.state = 2;
        return readFrameHeader(cb.header.major);

      case 1: // xheader
        cb.state = -1;
        return new strtok.BufferType(v - 4);

      case 2: // frameheader
        var header = cb.frameHeader = {};
        switch (cb.header.major) {
          case 2:
            header.id = v.toString('ascii', 0, 3);
            header.length = common.strtokUINT24_BE.get(v, 3, 6);
            break;
          case 3:
            header.id = v.toString('ascii', 0, 4);
            header.length = strtok.UINT32_BE.get(v, 4, 8);
            header.flags = readFrameFlags(v.slice(8, 10));
            break;
          case 4:
            header.id = v.toString('ascii', 0, 4);
            header.length = common.strtokINT32SYNCSAFE.get(v, 4, 8);
            header.flags = readFrameFlags(v.slice(8, 10));
            break;
        }

        // Last frame. Check first char is a letter, bit of defensive programming  
        if (header.id === '' || header.id === '\u0000\u0000\u0000\u0000'
            || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.search(header.id[0]) === -1) {
          return done();
        }
        cb.state++;
        return new strtok.BufferType(header.length);

      case 3: // framedata
        cb.state = 2; // frameheader up next
        var frame, encoding;
        switch (cb.header.major) {
          case 2:
            frame = parser.readData(v, cb.frameHeader.id, null, cb.header.major);
            callback(cb.frameHeader.id, frame);
            return new strtok.BufferType(6);
          case 3:
          case 4:
            if (cb.frameHeader.flags.format.unsync) {
              v = common.removeUnsyncBytes(v);
            }
            if (cb.frameHeader.flags.format.data_length_indicator) {
              v = v.slice(4, v.length);
            }
            frame = parser.readData(v, cb.frameHeader.id, cb.frameHeader.flags, cb.header.major);
            callback(cb.frameHeader.id, frame);
            return new strtok.BufferType(10);
        }
    }
  })

  function readFrameHeader (majorVer) {
    switch (majorVer) {
      case 2:
        return new strtok.BufferType(6);
      case 3:
      case 4:
        return new strtok.BufferType(10);
      default:
        return done(new Error('header version is incorrect'));
    }
  }
}

function readFrameFlags (b) {
  return {
    status: {
      tag_alter_preservation: common.strtokBITSET.get(b, 0, 6),
      file_alter_preservation: common.strtokBITSET.get(b, 0, 5),
      read_only: common.strtokBITSET.get(b, 0, 4)
    },
    format: {
      grouping_identity: common.strtokBITSET.get(b, 1, 7),
      compression: common.strtokBITSET.get(b, 1, 3),
      encryption: common.strtokBITSET.get(b, 1, 2),
      unsync: common.strtokBITSET.get(b, 1, 1),
      data_length_indicator: common.strtokBITSET.get(b, 1, 0)
    }
  }
}
