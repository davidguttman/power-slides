var shoe = require('shoe')
var http = require('http')
var eos = require('end-of-stream')

var server = http.createServer()
server.listen(1337)
console.log('RC Server started on port 1337')

var sessions = {}

var sock = shoe(function (stream) {
  console.log('stream connect', stream.id)
  sessions[stream.id] = stream

  stream.on('data', function (nSlide) {
    console.log('slide change:', nSlide)
    for (var id in sessions) {
      if (id !== stream.id) {
        sessions[id].write(nSlide)
      }
    }
  })

  eos(stream, function () {
    console.log('stream end', stream.id)
    delete sessions[stream.id]
  })
})

sock.install(server, '/rc')
