"""Loopback-only SMTP acceptance/fault server; never forwards a message."""
import socketserver
from threading import Thread


class _Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(5)
        self.wfile.write(b'220 disposable acceptance SMTP\r\n')
        while line := self.rfile.readline():
            verb = line.split(b' ', 1)[0].strip().upper()
            if verb in (b'EHLO', b'HELO', b'MAIL', b'RCPT', b'RSET', b'NOOP'):
                self.wfile.write(b'250 OK\r\n')
            elif verb == b'DATA':
                if self.server.outcome == 'reject':
                    self.wfile.write(b'451 temporary rejection\r\n')
                    continue
                self.wfile.write(b'354 End with dot\r\n')
                message = []
                while (part := self.rfile.readline()) not in (b'.\r\n', b''):
                    message.append(part[1:] if part.startswith(b'..') else part)
                self.server.messages.append(b''.join(message))
                if self.server.outcome == 'lost_ack':
                    return  # The message is accepted, but the client never receives 250.
                self.wfile.write(b'250 accepted\r\n')
            elif verb == b'QUIT':
                self.wfile.write(b'221 bye\r\n')
                return
            else:
                self.wfile.write(b'502 unsupported command\r\n')


class CapturedSMTP:
    def __init__(self, outcome='accepted'):
        self.server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), _Handler)
        self.server.daemon_threads = True
        self.server.outcome, self.server.messages = outcome, []
        self.thread = Thread(target=self.server.serve_forever, kwargs={'poll_interval': .05}, daemon=True)

    @property
    def port(self):
        return self.server.server_address[1]

    @property
    def messages(self):
        return self.server.messages

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
