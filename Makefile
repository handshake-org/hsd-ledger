all:
	@npm run webpack

browserify:
	@npm run browserify

webpack:
	@npm run webpack

clean:
	@npm run clean

lint:
	@npm run lint

test:
	@npm test

test-device:
	@npm run test-device

.PHONY: all browserify webpack clean lint test test-device

