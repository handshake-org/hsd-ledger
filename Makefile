all:
	@npm run webpack

browserify:
	@npm run browserify

webpack:
	@npm run webpack

webpack-dev: ./build/vendor.js
	@npm run webpack-dev

./build/vendor.js:
	@npm run webpack-devdeps

webpack-devdeps:
	@npm run webpack-devdeps

cert: .config/certs/cert.pem


.config/certs/cert.pem:
	@openssl req -x509 -newkey rsa:2048 \
		-keyout .config/certs/key.pem \
		-out .config/certs/cert.pem \
		-days 365 -batch -nodes

clean:
	@npm run clean

lint:
	@npm run lint

test:
	@npm test

test-hid:
	@npm run test-hid

test-u2f: .config/certs/cert.pem
	@npm run test-u2f

docs:
	@npm run docs

cover:
	@npm run cover

.PHONY: all browserify webpack webpack-dev webpack-devdeps clean lint test test-u2f test-hid cert docs

