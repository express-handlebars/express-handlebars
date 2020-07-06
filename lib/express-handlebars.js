/*
 * Copyright (c) 2015, Yahoo Inc. All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

const util = require("util");
const glob = util.promisify(require("glob"));
const Handlebars = require("handlebars");
const fs = require("graceful-fs");
const readFile = util.promisify(fs.readFile);
const path = require("path");

// -----------------------------------------------------------------------------

const defaultConfig = {
	handlebars: Handlebars,
	extname: ".handlebars",
	layoutsDir: undefined, // Default layouts directory is relative to `express settings.view` + `layouts/`
	partialsDir: undefined, // Default partials directory is relative to `express settings.view` + `partials/`
	defaultLayout: "main",
	helpers: undefined,
	compilerOptions: undefined,
	runtimeOptions: undefined,
};

class ExpressHandlebars {
	constructor (config = {}) {
		// Config properties with defaults.
		Object.assign(this, defaultConfig, config);

		// save given config to override other settings.
		this.config = config;

		// Express view engine integration point.
		this.engine = this.renderView.bind(this);

		// Normalize `extname`.
		if (this.extname.charAt(0) !== ".") {
			this.extname = "." + this.extname;
		}

		// Internal caches of compiled and precompiled templates.
		this.compiled = {};
		this.precompiled = {};

		// Private internal file system cache.
		this._fsCache = {};
	}

	async getPartials (options) {
		if (typeof this.partialsDir === "undefined") {
			return {};
		}
		const partialsDirs = Array.isArray(this.partialsDir) ? this.partialsDir : [this.partialsDir];

		const dirs = await Promise.all(partialsDirs.map(async dir => {
			let dirPath;
			let dirTemplates;
			let dirNamespace;

			// Support `partialsDir` collection with object entries that contain a
			// templates promise and a namespace.
			if (typeof dir === "string") {
				dirPath = dir;
			} else if (typeof dir === "object") {
				dirTemplates = dir.templates;
				dirNamespace = dir.namespace;
				dirPath = dir.dir;
			}

			// We must have some path to templates, or templates themselves.
			if (!dirPath && !dirTemplates) {
				throw new Error("A partials dir must be a string or config object");
			}

			const templates = dirTemplates || await this.getTemplates(dirPath, options);

			return {
				templates,
				namespace: dirNamespace,
			};
		}));

		const partials = {};

		for (const dir of dirs) {
			const { templates, namespace } = dir;
			const filePaths = Object.keys(templates);

			for (const filePath of filePaths) {
				const partialName = this._getTemplateName(filePath, namespace);
				partials[partialName] = templates[filePath];
			}
		}

		return partials;
	}

	async getTemplate (filePath, options = {}) {
		filePath = path.resolve(filePath);

		const cache = options.precompiled ? this.precompiled : this.compiled;
		let template = options.cache && cache[filePath];

		if (template) {
			return template;
		}

		// Optimistically cache template promise to reduce file system I/O, but
		// remove from cache if there was a problem.
		try {
			template = cache[filePath] = this._getFile(filePath, { cache: options.cache })
				.then(file => {
					const compileTemplate = (options.precompiled ? this._precompileTemplate : this._compileTemplate).bind(this);
					return compileTemplate(file, this.compilerOptions);
				});
			template = await template;
			return template;
		} catch (err) {
			delete cache[filePath];
			throw err;
		}
	}

	async getTemplates (dirPath, options = {}) {
		const cache = options.cache;

		const filePaths = await this._getDir(dirPath, { cache });
		const templates = await Promise.all(filePaths.map(filePath => {
			return this.getTemplate(path.join(dirPath, filePath), options);
		}));

		const hash = {};
		for (let i = 0; i < filePaths.length; i++) {
			hash[filePaths[i]] = templates[i];
		}
		return hash;
	}

	async render (filePath, context, options = {}) {
		const [template, partials] = await Promise.all([
			this.getTemplate(filePath, { cache: options.cache }),
			options.partials || this.getPartials({ cache: options.cache }),
		]);
		const helpers = { ...this.helpers, ...options.helpers };
		const runtimeOptions = { ...this.runtimeOptions, ...options.runtimeOptions };

		// Add ExpressHandlebars metadata to the data channel so that it's
		// accessible within the templates and helpers, namespaced under:
		// `@exphbs.*`
		const data = {
			...options.data,
			exphbs: {
				...options,
				filePath,
				helpers,
				partials,
				runtimeOptions,
			},
		};

		const html = this._renderTemplate(template, context, {
			...runtimeOptions,
			data,
			helpers,
			partials,
		});

		return html;
	}

	async renderView (viewPath, options = {}, callback = null) {
		const context = options;

		let promise;
		if (!callback) {
			promise = new Promise((resolve, reject) => {
				callback = (err, value) => { err !== null ? reject(err) : resolve(value); };
			});
		}

		// Express provides `settings.views` which is the path to the views dir that
		// the developer set on the Express app. When this value exists, it's used
		// to compute the view's name. Layouts and Partials directories are relative
		// to `settings.view` path
		let view;
		const viewsPath = options.settings && options.settings.views;
		if (viewsPath) {
			view = this._getTemplateName(path.relative(viewsPath, viewPath));
			this.partialsDir = this.config.partialsDir || path.join(viewsPath, "partials/");
			this.layoutsDir = this.config.layoutsDir || path.join(viewsPath, "layouts/");
		}

		// Merge render-level and instance-level helpers together.
		const helpers = { ...this.helpers, ...options.helpers };

		// Merge render-level and instance-level partials together.
		const partials = {
			...await this.getPartials({ cache: options.cache }),
			...await (options.partials || {}),
		};

		// Pluck-out ExpressHandlebars-specific options and Handlebars-specific
		// rendering options.
		options = {
			cache: options.cache,
			view,
			layout: "layout" in options ? options.layout : this.defaultLayout,

			data: options.data,
			helpers,
			partials,
			runtimeOptions: options.runtimeOptions,
		};

		try {
			let html = await this.render(viewPath, context, options);
			const layoutPath = this._resolveLayoutPath(options.layout);

			if (layoutPath) {
				html = await this.render(
					layoutPath,
					{ ...context, body: html },
					{ ...options, layout: undefined },
				);
			}
			callback(null, html);
		} catch (err) {
			callback(err);
		}

		return promise;
	}

	// -- Protected Hooks ----------------------------------------------------------

	_compileTemplate (template, options) {
		return this.handlebars.compile(template.trim(), options);
	}

	_precompileTemplate (template, options) {
		return this.handlebars.precompile(template.trim(), options);
	}

	_renderTemplate (template, context, options) {
		return template(context, options).trim();
	}

	// -- Private ------------------------------------------------------------------

	async _getDir (dirPath, options = {}) {
		dirPath = path.resolve(dirPath);

		const cache = this._fsCache;
		let dir = options.cache && cache[dirPath];

		if (dir) {
			dir = await dir;
			return dir.concat();
		}

		const pattern = "**/*" + this.extname;

		// Optimistically cache dir promise to reduce file system I/O, but remove
		// from cache if there was a problem.

		try {
			dir = cache[dirPath] = glob(pattern, {
				cwd: dirPath,
				follow: true,
			});
			if (options._throwTestError) {
				// FIXME: not sure how to throw error in glob for test coverage
				throw new Error("test");
			}
			dir = await dir;
			return dir.concat();
		} catch (err) {
			delete cache[dirPath];
			throw err;
		};
	}

	async _getFile (filePath, options = {}) {
		filePath = path.resolve(filePath);

		const cache = this._fsCache;
		let file = options.cache && cache[filePath];

		if (file) {
			return file;
		}

		// Optimistically cache file promise to reduce file system I/O, but remove
		// from cache if there was a problem.
		try {
			file = cache[filePath] = readFile(filePath, "utf8");
			file = await file;
			return file;
		} catch (err) {
			delete cache[filePath];
			throw err;
		};
	}

	_getTemplateName (filePath, namespace) {
		let name = filePath;

		if (name.endsWith(this.extname)) {
			name = name.substring(0, name.length - this.extname.length);
		}

		if (namespace) {
			name = namespace + "/" + name;
		}

		return name;
	}

	_resolveLayoutPath (layoutPath) {
		if (!layoutPath) {
			return null;
		}

		if (!path.extname(layoutPath)) {
			layoutPath += this.extname;
		}

		return path.resolve(this.layoutsDir || "", layoutPath);
	}
}

module.exports = ExpressHandlebars;
