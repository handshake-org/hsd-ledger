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

clean:
	@npm run clean

lint:
	@npm run lint

test:
	@npm test

test-device:
	@npm run test-device

.PHONY: all browserify webpack webpack-dev webpack-devdeps clean lint test test-device

