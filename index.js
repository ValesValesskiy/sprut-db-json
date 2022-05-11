let fs = require('fs'),
	path = require('path');

const DataSpaceSymbols = {
	data: Symbol('data'),
	saveTimeout: Symbol('saveTimeout'),
	haveBeenChange: Symbol('haveBeenChange')
};

class DataSpace {
	[DataSpaceSymbols.saveTimeout] = 0;

	constructor(dir, name, config = {}) {
		let stat,
			filePath = path.resolve(dir, name + '.json');

		try {
			stat = fs.statSync(dir);
		} catch(e) {
			fs.mkdirSync(dir);
			stat = fs.statSync(dir);
		}
		try {
			stat = fs.statSync(filePath);
		} catch(e) {
			fs.writeFileSync(filePath, JSON.stringify(defaultSpaceData()));
		}

		if (stat && stat.isFile()) {
			this[DataSpaceSymbols.data] = JSON.parse(fs.readFileSync(filePath));
		} else {
			this[DataSpaceSymbols.data] = defaultSpaceData();
		}
		this._dataPath = filePath;

		if (config.saveTimeout) {
			this[DataSpaceSymbols.saveTimeout] = config.saveTimeout;

			setTimeout(() => {
				saveTimeoutFunction.apply(this);
			}, this[DataSpaceSymbols.saveTimeout]);
		}
	}

	save(isForce) {
		if (this[DataSpaceSymbols.haveBeenChange] || !this[DataSpaceSymbols.saveTimeout] || isForce) {
			this[DataSpaceSymbols.haveBeenChange] = false;
			fs.writeFileSync(this._dataPath, JSON.stringify(this[DataSpaceSymbols.data]));
		}
	}

	createTable(table, config) {
		if (!this[DataSpaceSymbols.data].tables[table]) {
			this[DataSpaceSymbols.data].tables[table] = [];
		}

		if (config) {
			if (!this[DataSpaceSymbols.data].config) {
				this[DataSpaceSymbols.data].config = {};
			}
			this[DataSpaceSymbols.data].config[table] = {};
			if (config.idMethod) {
				this[DataSpaceSymbols.data].config[table].idMethod = config.idMethod.trim();
			}
		}

		this[DataSpaceSymbols.haveBeenChange] = true;

		this.save();
	}

	add(table, data) {
		let dataCopy = twin(data);

		if (this[DataSpaceSymbols.data].config[table] && this[DataSpaceSymbols.data].config[table].idMethod) {
			if (!dataCopy.id) {
				dataCopy.id = getId.apply(this, [this[DataSpaceSymbols.data].config[table].idMethod, table]);
			}
		}
		this[DataSpaceSymbols.data].tables[table].push(dataCopy);

		this[DataSpaceSymbols.haveBeenChange] = true;

		this.save();

		return dataCopy;
	}

	removeOne(table, fieldValues) {
		let findedTable = this[DataSpaceSymbols.data].tables[table],
			findedItemIndex = null;

		for(let i in findedTable) {
			let item = findedTable[i];

			for(let f in fieldValues) {
				if (!isEquivalent(item[f], fieldValues[f])) {
					continue;
				}
			}
			findedItemIndex = i;
			break;
		}
		if (findedItemIndex !== null) {
			findedTable.splice(i, 1);

			this[DataSpaceSymbols.haveBeenChange] = true;

			this.save();
		}
	}

	removeItems(table, fieldValues) {
		let findedTable = this[DataSpaceSymbols.data].tables[table],
			findedItemIndex = [];

		for(let i in findedTable) {
			let item = findedTable[i];

			for(let f in fieldValues) {
				if (!isEquivalent(item[f], fieldValues[f])) {
					continue;
				}
			}
			findedItemIndex.push(i);
		}
		findedItemIndex.forEach((itemIndex, index) => {
			findedTable.splice(itemIndex - index, 1);
		});
		if (findedItemIndex.length) {
			this[DataSpaceSymbols.haveBeenChange] = true;

			this.save();
		}
	}

	removeTable(table) {
		delete this[DataSpaceSymbols.data].tables[table];
		delete this[DataSpaceSymbols.data].config[table];

		this[DataSpaceSymbols.haveBeenChange] = true;

		this.save();
	}

	change(table, fieldValues, newValues, isFullChange) {
		if (this[DataSpaceSymbols.data].config[table].idMethod && typeof newValues.id === 'number') {
			return new OperationStatus(false, -1, `Update object { ${Object.keys(newValues).map((k, i, a) => k + ': ' + newValues[k] + (i !== a.length - 1 ? ',' : '')).join('')} } for table: ${table} has forbidden update field ':id'`);
		}

		let items = getItems.apply(this, [ table, fieldValues ]);

		if (!items.length) {
			return new OperationStatus(false, -1, `No items found for your request ${JSON.stringify(fieldValues)}`);
		}

		if (items.length > 1) {
			return new OperationStatus(false, -1, `Multiple items found for your request ${JSON.stringify(fieldValues)}`);
		}

		for (let p in newValues) {
			items[0][p] = newValues[p];
		}

		if (isFullChange) {
			for (let p in items[0]) {
				if (!newValues.getOwnPropertyDescriptor(p)) {
					delete items[0][p];
				}
			}
		}

		this[DataSpaceSymbols.haveBeenChange] = true;

		this.save();

		return new OperationStatus();
	}

	getOne(table, fieldValues, optionalFieldValues) {
		return twin(getItem.apply(this, [ table, fieldValues, optionalFieldValues ]));
	}

	getItems(table, fieldValues, optionalFieldValues) {
		return getItems.apply(this, [ table, fieldValues, optionalFieldValues ]).map(item => twin(item));
	}

	getTable(table) {
		return twin(this[DataSpaceSymbols.data].tables[table]);
	}
}

class OperationStatus {
	error = null;
	success = true;
	statusCode = 0;

	constructor(success = true, code = 0, error = null) {
		this.success = success;
		this.statusCode = code;
		this.error = error;
	}
}

function getItem(table, fieldValues, optionalFields) {
	let findedTable = this[DataSpaceSymbols.data].tables[table];

	checkItem: for(let i in findedTable) {
			let item = findedTable[i];

		for(let f in fieldValues) {
			if (!isEquivalent(item[f], fieldValues[f])) {
				continue checkItem;
			}
		}
		if (optionalFields) {
			for(let f in optionalFields) {
				if (isEquivalent(item[f], optionalFields[f])) {
					return item;
				}
			}
		}

		return item;
	}

	return null;
}

function getItems(table, fieldValues, optionalFieldValues) {
	let findedTable = this[DataSpaceSymbols.data].tables[table],
		res = [];

	checkItem: for(let i in findedTable) {
		let item = findedTable[i];

		for(let f in fieldValues) {
			if (!isEquivalent(item[f], fieldValues[f])) {
				continue checkItem;
			}
		}
		if (optionalFieldValues) {
			for(let f in optionalFieldValues) {
				if (isEquivalent(item[f], optionalFieldValues[f])) {
					res.push(item);
					continue checkItem;
				}
			}
			continue checkItem;
		}
		res.push(item);
	}

	return res;
}

function isEquivalent(value, template) {
	if (template instanceof RegExp) {
		return template.test(value);
	} else {
		return template === value;
	}
}

function defaultSpaceData() {
	return {tables: {}, config: {}};
}

function twin(o) {
	if (o === undefined || o === NaN || o === null) {
		return o;
	}

	let n = o instanceof Array ? [] : {};

	for(let p in o) {
		if (o[p] instanceof Object) {
			n[p] = twin(o[p]);
		} else {
			n[p] = o[p];
		}
	}

	return n;
}
const idMethods = {
	/*time: function(options) {
		let id = new Date().getTime().toString(),
			n = parseInt(options);

		for(let i = 0; i < n; i++) {
			id += Math.floor(Math.random() * 10).toString();
		}

		return id;
	},*/
	increament: function(options, tableName) {
		const index = this[DataSpaceSymbols.data].config[tableName].lastIndex;

		if (typeof index !== 'number') {
			this[DataSpaceSymbols.data].config[tableName].lastIndex = 0;

			return 0;
		} else {
			this[DataSpaceSymbols.data].config[tableName].lastIndex += 1;

			return this[DataSpaceSymbols.data].config[tableName].lastIndex;
		}
	}
};

function getId(method, tableName) {
	let methodType = method.match(/^\S*/),
		options;

	if (methodType) {
		methodType = methodType[0];
		options = method.replace(new RegExp(`^${methodType}`), '');

		return idMethods[methodType].apply(this, [options.trim(), tableName]);
	} else {
		throw new Error(`ID method ${method} is not valid`);
	}
}

function saveTimeoutFunction() {
	if (this[DataSpaceSymbols.haveBeenChange]) {
		this.save();
	}

	setTimeout(() => {
		saveTimeoutFunction.apply(this);
	}, this[DataSpaceSymbols.saveTimeout]);
}

module.exports = { DataSpace };