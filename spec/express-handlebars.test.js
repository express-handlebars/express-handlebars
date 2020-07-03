const path = require("path");
const ExpressHandlebars = require("../lib/express-handlebars.js");

function fixturePath (filePath = "") {
	return path.resolve(__dirname, "./fixtures", filePath);
}

describe("express-handlebars", () => {
	test("should nomalize extname", () => {
		const exphbs1 = new ExpressHandlebars({ extname: "ext" });
		const exphbs2 = new ExpressHandlebars({ extname: ".ext" });
		expect(exphbs1.extname).toBe(".ext");
		expect(exphbs2.extname).toBe(".ext");
	});

	describe("getPartials", () => {
		test("should throw if partialsDir is not correct type", async () => {
			const exphbs = new ExpressHandlebars({ partialsDir: 1 });
			let error;
			try {
				await exphbs.getPartials();
			} catch (e) {
				error = e;
			}
			expect(error).toEqual(expect.any(Error));
			expect(error.message).toBe("A partials dir must be a string or config object");
		});

		test("should return empty object if no partialsDir is defined", async () => {
			const exphbs = new ExpressHandlebars();
			const partials = await exphbs.getPartials();
			expect(partials).toEqual({});
		});

		test("should return empty object partialsDir does not exist", async () => {
			const exphbs = new ExpressHandlebars({ partialsDir: "does-not-exist" });
			const partials = await exphbs.getPartials();
			expect(partials).toEqual({});
		});

		test("should return partials on string", async () => {
			const exphbs = new ExpressHandlebars({ partialsDir: fixturePath("partials") });
			const partials = await exphbs.getPartials();
			expect(partials).toEqual({
				partial: expect.any(Function),
			});
		});

		test("should return partials on array", async () => {
			const exphbs = new ExpressHandlebars({ partialsDir: [fixturePath("partials")] });
			const partials = await exphbs.getPartials();
			expect(partials).toEqual({
				partial: expect.any(Function),
			});
		});

		test("should return partials on path relative to cwd", async () => {
			const exphbs = new ExpressHandlebars({ partialsDir: "spec/fixtures/partials" });
			const partials = await exphbs.getPartials();
			expect(partials).toEqual({
				partial: expect.any(Function),
			});
		});

		test("should return template function", async () => {
			const exphbs = new ExpressHandlebars({ partialsDir: "spec/fixtures/partials" });
			const partials = await exphbs.getPartials();
			const html = partials.partial({ text: "test text" });
			expect(html).toBe("partial test text");
		});
	});

	describe("getTemplate", () => {
		test("should return cached template", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("templates/template.handlebars");
			const compiledCachedFunction = Symbol("compiledCachedFunction");
			exphbs.compiled[filePath] = compiledCachedFunction;
			const precompiledCachedFunction = Symbol("precompiledCachedFunction");
			exphbs.precompiled[filePath] = precompiledCachedFunction;
			const template = await exphbs.getTemplate(filePath, { cache: true });
			expect(template).toBe(compiledCachedFunction);
		});

		test("should return precompiled cached template", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("templates/template.handlebars");
			const compiledCachedFunction = Symbol("compiledCachedFunction");
			exphbs.compiled[filePath] = compiledCachedFunction;
			const precompiledCachedFunction = Symbol("precompiledCachedFunction");
			exphbs.precompiled[filePath] = precompiledCachedFunction;
			const template = await exphbs.getTemplate(filePath, { precompiled: true, cache: true });
			expect(template).toBe(precompiledCachedFunction);
		});

		test("should store in precompiled cache", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("templates/template.handlebars");
			expect(exphbs.compiled[filePath]).toBeUndefined();
			expect(exphbs.precompiled[filePath]).toBeUndefined();
			await exphbs.getTemplate(filePath, { precompiled: true });
			expect(exphbs.compiled[filePath]).toBeUndefined();
			expect(exphbs.precompiled[filePath]).toBeDefined();
		});

		test("should store in compiled cache", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("templates/template.handlebars");
			expect(exphbs.compiled[filePath]).toBeUndefined();
			expect(exphbs.precompiled[filePath]).toBeUndefined();
			await exphbs.getTemplate(filePath);
			expect(exphbs.compiled[filePath]).toBeDefined();
			expect(exphbs.precompiled[filePath]).toBeUndefined();
		});

		test("should return a template", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("templates/template.handlebars");
			const template = await exphbs.getTemplate(filePath);
			const html = template({ text: "test text" });
			expect(html).toBe("<p>test text</p>");
		});

		test("should not store in cache on error", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = "does-not-exist";
			expect(exphbs.compiled[filePath]).toBeUndefined();
			let error;
			try {
				await exphbs.getTemplate(filePath);
			} catch (e) {
				error = e;
			}
			expect(error.message).toEqual(expect.stringContaining("no such file or directory"));
			expect(exphbs.compiled[filePath]).toBeUndefined();
		});
	});

	describe("getTemplates", () => {
		test("should return cached templates", async () => {
			const exphbs = new ExpressHandlebars();
			const dirPath = fixturePath("templates");
			const fsCache = Promise.resolve([]);
			exphbs._fsCache[dirPath] = fsCache;
			const templates = await exphbs.getTemplates(dirPath, { cache: true });
			expect(templates).toEqual({});
		});

		test("should return templates", async () => {
			const exphbs = new ExpressHandlebars();
			const dirPath = fixturePath("templates");
			const templates = await exphbs.getTemplates(dirPath);
			const html = templates["template.handlebars"]({ text: "test text" });
			expect(html).toBe("<p>test text</p>");
		});

		test("should get templates in sub directories", async () => {
			const exphbs = new ExpressHandlebars();
			const dirPath = fixturePath("templates");
			const templates = await exphbs.getTemplates(dirPath);
			expect(Object.keys(templates)).toEqual([
				"subdir/template.handlebars",
				"template.handlebars",
			]);
		});
	});

	describe("render", () => {
		test("should return cached templates", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("render-cached.handlebars");
			exphbs.compiled[filePath] = () => "cached";
			const html = await exphbs.render(filePath, null, { cache: true });
			expect(html).toBe("cached");
		});

		test("should use helpers", async () => {
			const exphbs = new ExpressHandlebars({
				helpers: {
					help: () => "help",
				},
			});
			const filePath = fixturePath("render-helper.handlebars");
			const html = await exphbs.render(filePath, { text: "test text" });
			expect(html).toBe("<p>help</p>");
		});

		test("should override helpers", async () => {
			const exphbs = new ExpressHandlebars({
				helpers: {
					help: () => "help",
				},
			});
			const filePath = fixturePath("render-helper.handlebars");
			const html = await exphbs.render(filePath, { text: "test text" }, {
				helpers: {
					help: (text) => text,
				},
			});
			expect(html).toBe("<p>test text</p>");
		});

		test("should return html", async () => {
			const exphbs = new ExpressHandlebars();
			const filePath = fixturePath("render-text.handlebars");
			const html = await exphbs.render(filePath, { text: "test text" });
			expect(html).toBe("<p>test text</p>");
		});

		test("should render with partial", async () => {
			const exphbs = new ExpressHandlebars({
				partialsDir: fixturePath("partials"),
			});
			const filePath = fixturePath("render-partial.handlebars");
			const html = await exphbs.render(filePath, { text: "test text" });
			expect(html.replace(/\r/g, "")).toBe("<h1>partial test text</h1>\n<p>test text</p>");
		});

		test("should render with runtimeOptions", async () => {
			const exphbs = new ExpressHandlebars({
				runtimeOptions: { runtimeOptionTest: "test" },
			});
			const filePath = fixturePath("test");
			const spy = jest.fn(() => { return "test"; });
			exphbs.compiled[filePath] = spy;
			await exphbs.render(filePath, null, { cache: true });
			expect(spy).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ runtimeOptionTest: "test" }));
		});

		test("should override runtimeOptions", async () => {
			const exphbs = new ExpressHandlebars({
				runtimeOptions: { runtimeOptionTest: "test" },
			});
			const filePath = fixturePath("test");
			const spy = jest.fn(() => { return "test"; });
			exphbs.compiled[filePath] = spy;
			await exphbs.render(filePath, null, {
				cache: true,
				runtimeOptions: { runtimeOptionTest: "test2" },
			});
			expect(spy).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ runtimeOptionTest: "test2" }));
		});
	});

	describe("renderView", () => {
		test("should use settings.views", async () => {
			const exphbs = new ExpressHandlebars();
			const viewPath = fixturePath("render-partial.handlebars");
			const viewsPath = fixturePath();
			const html = await exphbs.renderView(viewPath, {
				text: "test text",
				settings: { views: viewsPath },
			});
			expect(html.replace(/\r/g, "")).toBe("<body>\n<h1>partial test text</h1>\n<p>test text</p>\n</body>");
		});

		test("should use settings.views when it changes", async () => {
			const exphbs = new ExpressHandlebars();
			const viewPath = fixturePath("render-partial.handlebars");
			const viewsPath = fixturePath();
			const html = await exphbs.renderView(viewPath, {
				text: "test text",
				settings: { views: viewsPath },
			});
			expect(html.replace(/\r/g, "")).toBe("<body>\n<h1>partial test text</h1>\n<p>test text</p>\n</body>");
			const otherViewsPath = fixturePath("other-views");
			const otherhtml = await exphbs.renderView(viewPath, {
				text: "test text",
				settings: { views: otherViewsPath },
			});
			expect(otherhtml.replace(/\r/g, "")).toBe("<body>\nother layout\n<h1>other partial test text</h1>\n<p>test text</p>\n</body>");
		});

		test("should not overwrite config with settings.views", async () => {
			const exphbs = new ExpressHandlebars({
				layoutsDir: fixturePath("layouts"),
				partialsDir: fixturePath("partials"),
			});
			const viewPath = fixturePath("render-partial.handlebars");
			const viewsPath = fixturePath("other-views");
			const html = await exphbs.renderView(viewPath, {
				text: "test text",
				settings: { views: viewsPath },
			});
			expect(html.replace(/\r/g, "")).toBe("<body>\n<h1>partial test text</h1>\n<p>test text</p>\n</body>");
		});

		test("should merge helpers", async () => {
			const exphbs = new ExpressHandlebars({
				defaultLayout: null,
				helpers: {
					help: () => "help",
				},
			});
			const viewPath = fixturePath("render-helper.handlebars");
			const html = await exphbs.renderView(viewPath, {
				text: "test text",
				helpers: {
					help: (text) => text,
				},
			});
			expect(html).toBe("<p>test text</p>");
		});

		test("should use layout option", async () => {
			const exphbs = new ExpressHandlebars({ defaultLayout: null });
			const layoutPath = fixturePath("layouts/main.handlebars");
			const viewPath = fixturePath("render-text.handlebars");
			const html = await exphbs.renderView(viewPath, {
				text: "test text",
				layout: layoutPath,
			});
			expect(html.replace(/\r/g, "")).toBe("<body>\n<p>test text</p>\n</body>");
		});

		test("should render html", async () => {
			const exphbs = new ExpressHandlebars({ defaultLayout: null });
			const viewPath = fixturePath("render-text.handlebars");
			const html = await exphbs.renderView(viewPath, { text: "test text" });
			expect(html).toBe("<p>test text</p>");
		});

		test("should call callback with html", (done) => {
			const exphbs = new ExpressHandlebars({ defaultLayout: null });
			const viewPath = fixturePath("render-text.handlebars");
			exphbs.renderView(viewPath, { text: "test text" }, (err, html) => {
				expect(err).toBe(null);
				expect(html).toBe("<p>test text</p>");
				done();
			});
		});

		test("should call callback with error", (done) => {
			const exphbs = new ExpressHandlebars({ defaultLayout: null });
			const viewPath = "does-not-exist";
			exphbs.renderView(viewPath, {}, (err, html) => {
				expect(err.message).toEqual(expect.stringContaining("no such file or directory"));
				expect(html).toBeUndefined();
				done();
			});
		});

		test("should use runtimeOptions", async () => {
			const exphbs = new ExpressHandlebars({ defaultLayout: null });
			const filePath = fixturePath("test");
			const spy = jest.fn(() => { return "test"; });
			exphbs.compiled[filePath] = spy;
			await exphbs.renderView(filePath, {
				cache: true,
				runtimeOptions: { runtimeOptionTest: "test" },
			});
			expect(spy).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ runtimeOptionTest: "test" }));
		});
	});
});
