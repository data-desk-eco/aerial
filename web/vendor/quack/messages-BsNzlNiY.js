//#region src/constants.ts
var e = 3, t = 9494, n = "/quack", r = "application/vnd.duckdb", i = 65535, a = 18446744073709551615n, o = 60, s = 9223372036854775807n / 1000n, c = 2048, l = class extends Error {
	constructor(e, t) {
		super(e, t), this.name = "QuackError";
	}
}, u = class extends l {
	constructor(e, t) {
		super(e, t), this.name = "QuackProtocolError";
	}
}, ee = class extends l {
	serverMessage;
	exceptionType;
	extraInfo;
	mustInvalidate;
	constructor(e, t = {}) {
		super(t.exceptionType ? `${t.exceptionType} Error: ${e}` : e), this.name = "QuackServerError", this.serverMessage = e, this.exceptionType = t.exceptionType, this.extraInfo = t.extraInfo ?? {}, this.mustInvalidate = t.mustInvalidate ?? !1;
	}
}, d = class extends u {
	constructor(e, t) {
		super(e, t), this.name = "QuackUnsupportedTypeError";
	}
}, te = new TextEncoder(), ne = new TextDecoder(), f = class {
	buffer;
	offset = 0;
	constructor(e = 1024) {
		this.buffer = new Uint8Array(e);
	}
	toUint8Array() {
		return this.buffer.slice(0, this.offset);
	}
	writeObject(e) {
		e(this), this.writeFieldId(i);
	}
	writeField(e, t) {
		this.writeFieldId(e), t(this);
	}
	writeFieldId(e) {
		if (!Number.isInteger(e) || e < 0 || e > 65535) throw new u(`Invalid field id ${e}`);
		this.ensure(2), this.buffer[this.offset++] = e & 255, this.buffer[this.offset++] = e >>> 8 & 255;
	}
	writeByte(e) {
		if (!Number.isInteger(e) || e < 0 || e > 255) throw new u(`Invalid byte ${e}`);
		this.ensure(1), this.buffer[this.offset++] = e;
	}
	writeBytes(e) {
		this.ensure(e.byteLength), this.buffer.set(e, this.offset), this.offset += e.byteLength;
	}
	writeBool(e) {
		this.writeByte(+!!e);
	}
	writeUleb(e) {
		let t = g(e);
		for (; t >= 128n;) this.writeByte(Number(t & 127n | 128n)), t >>= 7n;
		this.writeByte(Number(t));
	}
	writeSleb(e) {
		let t = BigInt(e), n = !0;
		for (; n;) {
			let e = Number(t & 127n);
			t >>= 7n;
			let r = (e & 64) != 0;
			t === 0n && !r || t === -1n && r ? n = !1 : e |= 128, this.writeByte(e);
		}
	}
	writeString(e) {
		this.writeStringBytes(te.encode(e));
	}
	writeStringBytes(e) {
		this.writeUleb(e.byteLength), this.writeBytes(e);
	}
	writeBlob(e) {
		this.writeUleb(BigInt(e.byteLength)), this.writeBytes(e);
	}
	writeList(e, t) {
		this.writeUleb(e.length);
		for (let n = 0; n < e.length; n++) t(e[n], n);
	}
	writeNullable(e, t) {
		if (e == null) {
			this.writeBool(!1);
			return;
		}
		this.writeBool(!0), t(e);
	}
	writeHugeInt(e) {
		let t = typeof e == "bigint" ? h(e) : e;
		this.writeSleb(t.upper), this.writeUleb(t.lower);
	}
	writeFixedInt8(e) {
		this.writeByte(e & 255);
	}
	writeFixedUint8(e) {
		this.writeByte(e);
	}
	writeFixedInt16(e) {
		let t = new Uint8Array(2);
		new DataView(t.buffer).setInt16(0, e, !0), this.writeBytes(t);
	}
	writeFixedUint16(e) {
		let t = new Uint8Array(2);
		new DataView(t.buffer).setUint16(0, e, !0), this.writeBytes(t);
	}
	writeFixedInt32(e) {
		let t = new Uint8Array(4);
		new DataView(t.buffer).setInt32(0, e, !0), this.writeBytes(t);
	}
	writeFixedUint32(e) {
		let t = new Uint8Array(4);
		new DataView(t.buffer).setUint32(0, e, !0), this.writeBytes(t);
	}
	writeFixedFloat32(e) {
		let t = new Uint8Array(4);
		new DataView(t.buffer).setFloat32(0, e, !0), this.writeBytes(t);
	}
	writeFixedFloat64(e) {
		let t = new Uint8Array(8);
		new DataView(t.buffer).setFloat64(0, e, !0), this.writeBytes(t);
	}
	writeFixedInt64(e) {
		let t = new Uint8Array(8);
		new DataView(t.buffer).setBigInt64(0, BigInt(e), !0), this.writeBytes(t);
	}
	writeFixedUint64(e) {
		let t = new Uint8Array(8);
		new DataView(t.buffer).setBigUint64(0, g(e), !0), this.writeBytes(t);
	}
	ensure(e) {
		let t = this.offset + e;
		if (t <= this.buffer.byteLength) return;
		let n = this.buffer.byteLength;
		for (; n < t;) n *= 2;
		let r = new Uint8Array(n);
		r.set(this.buffer), this.buffer = r;
	}
}, p = class {
	bytes;
	view;
	offset = 0;
	constructor(e) {
		this.bytes = e, this.view = new DataView(e.buffer, e.byteOffset, e.byteLength);
	}
	get position() {
		return this.offset;
	}
	get remaining() {
		return this.bytes.byteLength - this.offset;
	}
	eof() {
		return this.remaining === 0;
	}
	assertEof() {
		if (!this.eof()) throw new u(`Unexpected trailing bytes at offset ${this.offset}`);
	}
	readObject(e) {
		let t = e(this);
		return this.readEndObject(), t;
	}
	readEndObject() {
		let e = this.readFieldId();
		if (e !== 65535) throw new u(`Expected end of object at offset ${this.offset - 2}, got field ${e}`);
	}
	readFieldId() {
		this.ensure(2);
		let e = this.view.getUint16(this.offset, !0);
		return this.offset += 2, e;
	}
	peekFieldId() {
		return this.ensure(2), this.view.getUint16(this.offset, !0);
	}
	readRequiredField(e, t) {
		let n = this.readFieldId();
		if (n !== e) throw new u(`Expected field ${e} at offset ${this.offset - 2}, got ${n}`);
		return t();
	}
	readOptionalField(e, t, n) {
		return this.peekFieldId() === e ? (this.readFieldId(), t()) : n;
	}
	readByte() {
		return this.ensure(1), this.bytes[this.offset++];
	}
	readBytes(e) {
		if (!Number.isInteger(e) || e < 0) throw new u(`Invalid byte length ${e}`);
		this.ensure(e);
		let t = this.offset;
		return this.offset += e, this.bytes.slice(t, this.offset);
	}
	readBool() {
		let e = this.readByte();
		if (e !== 0 && e !== 1) throw new u(`Invalid boolean byte ${e}`);
		return e === 1;
	}
	readUlebBigInt() {
		let e = 0n, t = 0n;
		for (let n = 0; n < 10; n++) {
			let n = this.readByte();
			if (e |= BigInt(n & 127) << t, !(n & 128)) return e;
			t += 7n;
		}
		throw new u("Unsigned LEB128 value is too long");
	}
	readUlebNumber() {
		return m(this.readUlebBigInt(), "unsigned LEB128");
	}
	readSlebBigInt() {
		let e = 0n, t = 0n, n = 0;
		for (let r = 0; r < 10; r++) if (n = this.readByte(), e |= BigInt(n & 127) << t, t += 7n, !(n & 128)) return n & 64 && (e |= -1n << t), e;
		throw new u("Signed LEB128 value is too long");
	}
	readSlebNumber() {
		return m(this.readSlebBigInt(), "signed LEB128");
	}
	readString() {
		return ne.decode(this.readStringBytes());
	}
	readStringBytes() {
		let e = this.readUlebNumber();
		return this.readBytes(e);
	}
	readBlob() {
		let e = this.readUlebNumber();
		return this.readBytes(e);
	}
	readList(e) {
		let t = this.readUlebNumber(), n = [];
		for (let r = 0; r < t; r++) n.push(e(r));
		return n;
	}
	readNullable(e) {
		return this.readBool() ? e() : void 0;
	}
	readHugeInt() {
		return {
			upper: this.readSlebBigInt(),
			lower: this.readUlebBigInt()
		};
	}
	readFixedInt8() {
		return this.readByte() << 24 >> 24;
	}
	readFixedUint8() {
		return this.readByte();
	}
	readFixedInt16() {
		this.ensure(2);
		let e = this.view.getInt16(this.offset, !0);
		return this.offset += 2, e;
	}
	readFixedUint16() {
		this.ensure(2);
		let e = this.view.getUint16(this.offset, !0);
		return this.offset += 2, e;
	}
	readFixedInt32() {
		this.ensure(4);
		let e = this.view.getInt32(this.offset, !0);
		return this.offset += 4, e;
	}
	readFixedUint32() {
		this.ensure(4);
		let e = this.view.getUint32(this.offset, !0);
		return this.offset += 4, e;
	}
	readFixedFloat32() {
		this.ensure(4);
		let e = this.view.getFloat32(this.offset, !0);
		return this.offset += 4, e;
	}
	readFixedFloat64() {
		this.ensure(8);
		let e = this.view.getFloat64(this.offset, !0);
		return this.offset += 8, e;
	}
	readFixedInt64() {
		this.ensure(8);
		let e = this.view.getBigInt64(this.offset, !0);
		return this.offset += 8, e;
	}
	readFixedUint64() {
		this.ensure(8);
		let e = this.view.getBigUint64(this.offset, !0);
		return this.offset += 8, e;
	}
	ensure(e) {
		if (this.offset + e > this.bytes.byteLength) throw new u(`Unexpected end of input at offset ${this.offset}; needed ${e} byte(s), have ${this.remaining}`);
	}
};
function re(e) {
	let t = e.reduce((e, t) => e + t.byteLength, 0), n = new Uint8Array(t), r = 0;
	for (let t of e) n.set(t, r), r += t.byteLength;
	return n;
}
function m(e, t) {
	if (e > BigInt(2 ** 53 - 1) || e < BigInt(-(2 ** 53 - 1))) throw new u(`${t} value ${e.toString()} exceeds JavaScript safe integer range`);
	return Number(e);
}
function h(e) {
	return {
		lower: BigInt.asUintN(64, e),
		upper: BigInt.asIntN(64, e >> 64n)
	};
}
function ie(e) {
	return BigInt.asIntN(64, e.upper) << 64n | BigInt.asUintN(64, e.lower);
}
function ae(e) {
	return BigInt.asUintN(64, e.upper) << 64n | BigInt.asUintN(64, e.lower);
}
function g(e) {
	let t = BigInt(e);
	if (t < 0n) throw new u(`Expected unsigned integer, got ${e.toString()}`);
	return t;
}
//#endregion
//#region src/logical-types.ts
var _ = /* @__PURE__ */ function(e) {
	return e[e.BOOL = 1] = "BOOL", e[e.UINT8 = 2] = "UINT8", e[e.INT8 = 3] = "INT8", e[e.UINT16 = 4] = "UINT16", e[e.INT16 = 5] = "INT16", e[e.UINT32 = 6] = "UINT32", e[e.INT32 = 7] = "INT32", e[e.UINT64 = 8] = "UINT64", e[e.INT64 = 9] = "INT64", e[e.FLOAT = 11] = "FLOAT", e[e.DOUBLE = 12] = "DOUBLE", e[e.INTERVAL = 21] = "INTERVAL", e[e.LIST = 23] = "LIST", e[e.STRUCT = 24] = "STRUCT", e[e.ARRAY = 29] = "ARRAY", e[e.VARCHAR = 200] = "VARCHAR", e[e.UINT128 = 203] = "UINT128", e[e.INT128 = 204] = "INT128", e[e.UNKNOWN = 205] = "UNKNOWN", e[e.BIT = 206] = "BIT", e[e.INVALID = 255] = "INVALID", e;
}({}), v = /* @__PURE__ */ function(e) {
	return e[e.INVALID = 0] = "INVALID", e[e.SQLNULL = 1] = "SQLNULL", e[e.UNKNOWN = 2] = "UNKNOWN", e[e.ANY = 3] = "ANY", e[e.UNBOUND = 4] = "UNBOUND", e[e.TEMPLATE = 5] = "TEMPLATE", e[e.TYPE = 6] = "TYPE", e[e.BOOLEAN = 10] = "BOOLEAN", e[e.TINYINT = 11] = "TINYINT", e[e.SMALLINT = 12] = "SMALLINT", e[e.INTEGER = 13] = "INTEGER", e[e.BIGINT = 14] = "BIGINT", e[e.DATE = 15] = "DATE", e[e.TIME = 16] = "TIME", e[e.TIMESTAMP_SEC = 17] = "TIMESTAMP_SEC", e[e.TIMESTAMP_MS = 18] = "TIMESTAMP_MS", e[e.TIMESTAMP = 19] = "TIMESTAMP", e[e.TIMESTAMP_NS = 20] = "TIMESTAMP_NS", e[e.DECIMAL = 21] = "DECIMAL", e[e.FLOAT = 22] = "FLOAT", e[e.DOUBLE = 23] = "DOUBLE", e[e.CHAR = 24] = "CHAR", e[e.VARCHAR = 25] = "VARCHAR", e[e.BLOB = 26] = "BLOB", e[e.INTERVAL = 27] = "INTERVAL", e[e.UTINYINT = 28] = "UTINYINT", e[e.USMALLINT = 29] = "USMALLINT", e[e.UINTEGER = 30] = "UINTEGER", e[e.UBIGINT = 31] = "UBIGINT", e[e.TIMESTAMP_TZ = 32] = "TIMESTAMP_TZ", e[e.TIMESTAMP_TZ_NS = 33] = "TIMESTAMP_TZ_NS", e[e.TIME_TZ = 34] = "TIME_TZ", e[e.TIME_NS = 35] = "TIME_NS", e[e.BIT = 36] = "BIT", e[e.STRING_LITERAL = 37] = "STRING_LITERAL", e[e.INTEGER_LITERAL = 38] = "INTEGER_LITERAL", e[e.BIGNUM = 39] = "BIGNUM", e[e.UHUGEINT = 49] = "UHUGEINT", e[e.HUGEINT = 50] = "HUGEINT", e[e.POINTER = 51] = "POINTER", e[e.VALIDITY = 53] = "VALIDITY", e[e.UUID = 54] = "UUID", e[e.GEOMETRY = 60] = "GEOMETRY", e[e.STRUCT = 100] = "STRUCT", e[e.LIST = 101] = "LIST", e[e.MAP = 102] = "MAP", e[e.TABLE = 103] = "TABLE", e[e.ENUM = 104] = "ENUM", e[e.AGGREGATE_STATE = 105] = "AGGREGATE_STATE", e[e.LAMBDA = 106] = "LAMBDA", e[e.UNION = 107] = "UNION", e[e.ARRAY = 108] = "ARRAY", e[e.VARIANT = 109] = "VARIANT", e[e.TUPLE = 110] = "TUPLE", e;
}({}), y = /* @__PURE__ */ function(e) {
	return e[e.INVALID = 0] = "INVALID", e[e.GENERIC = 1] = "GENERIC", e[e.DECIMAL = 2] = "DECIMAL", e[e.STRING = 3] = "STRING", e[e.LIST = 4] = "LIST", e[e.STRUCT = 5] = "STRUCT", e[e.ENUM = 6] = "ENUM", e[e.UNBOUND = 7] = "UNBOUND", e[e.AGGREGATE_STATE = 8] = "AGGREGATE_STATE", e[e.ARRAY = 9] = "ARRAY", e[e.ANY = 10] = "ANY", e[e.INTEGER_LITERAL = 11] = "INTEGER_LITERAL", e[e.TEMPLATE = 12] = "TEMPLATE", e[e.GEO = 13] = "GEO", e;
}({});
function b(e, t) {
	return t ? {
		id: e,
		typeInfo: t
	} : { id: e };
}
var oe = {
	null: () => b(v.SQLNULL),
	boolean: () => b(v.BOOLEAN),
	tinyint: () => b(v.TINYINT),
	smallint: () => b(v.SMALLINT),
	integer: () => b(v.INTEGER),
	bigint: () => b(v.BIGINT),
	utinyint: () => b(v.UTINYINT),
	usmallint: () => b(v.USMALLINT),
	uinteger: () => b(v.UINTEGER),
	ubigint: () => b(v.UBIGINT),
	hugeint: () => b(v.HUGEINT),
	uhugeint: () => b(v.UHUGEINT),
	float: () => b(v.FLOAT),
	double: () => b(v.DOUBLE),
	char: (e) => e ? b(v.CHAR, {
		type: y.STRING,
		collation: e
	}) : b(v.CHAR),
	varchar: (e) => e ? b(v.VARCHAR, {
		type: y.STRING,
		collation: e
	}) : b(v.VARCHAR),
	blob: () => b(v.BLOB),
	bit: () => b(v.BIT),
	uuid: () => b(v.UUID),
	date: () => b(v.DATE),
	time: () => b(v.TIME),
	timeNs: () => b(v.TIME_NS),
	timeTz: () => b(v.TIME_TZ),
	timestamp: () => b(v.TIMESTAMP),
	timestampSeconds: () => b(v.TIMESTAMP_SEC),
	timestampMillis: () => b(v.TIMESTAMP_MS),
	timestampNanos: () => b(v.TIMESTAMP_NS),
	timestampTz: () => b(v.TIMESTAMP_TZ),
	timestampTzNanos: () => b(v.TIMESTAMP_TZ_NS),
	interval: () => b(v.INTERVAL),
	decimal: (e, t) => b(v.DECIMAL, {
		type: y.DECIMAL,
		width: e,
		scale: t
	}),
	list: (e) => b(v.LIST, {
		type: y.LIST,
		childType: e
	}),
	map: (e, t) => b(v.MAP, {
		type: y.LIST,
		childType: b(v.STRUCT, {
			type: y.STRUCT,
			childTypes: [{
				name: "key",
				type: e
			}, {
				name: "value",
				type: t
			}]
		})
	}),
	struct: (e) => b(v.STRUCT, {
		type: y.STRUCT,
		childTypes: e
	}),
	tuple: (e) => b(v.TUPLE, {
		type: y.STRUCT,
		childTypes: e.map((e) => ({
			name: "",
			type: e
		}))
	}),
	array: (e, t) => b(v.ARRAY, {
		type: y.ARRAY,
		childType: e,
		size: t
	}),
	enum: (e) => b(v.ENUM, {
		type: y.ENUM,
		values: e
	}),
	geometry: (e) => e ? b(v.GEOMETRY, {
		type: y.GEO,
		crs: e
	}) : b(v.GEOMETRY)
};
function x(e, t) {
	e.writeObject((e) => {
		e.writeField(100, () => e.writeUleb(t.id)), t.typeInfo && e.writeField(101, () => e.writeNullable(t.typeInfo, (t) => se(e, t)));
	});
}
function S(e) {
	return e.readObject((e) => {
		let t = e.readRequiredField(100, () => e.readUlebNumber()), n = e.readOptionalField(101, () => e.readNullable(() => ce(e)), void 0);
		return n ? {
			id: t,
			typeInfo: n
		} : { id: t };
	});
}
function se(e, t) {
	e.writeObject((e) => {
		switch (e.writeField(100, () => e.writeUleb(t.type)), t.alias && e.writeField(101, () => e.writeString(t.alias)), t.type) {
			case y.INVALID:
			case y.GENERIC: break;
			case y.DECIMAL:
				e.writeField(200, () => e.writeUleb(t.width)), e.writeField(201, () => e.writeUleb(t.scale));
				break;
			case y.STRING:
				e.writeField(200, () => e.writeString(t.collation ?? ""));
				break;
			case y.LIST:
				e.writeField(200, () => x(e, t.childType));
				break;
			case y.STRUCT:
				e.writeField(200, () => le(e, t.childTypes));
				break;
			case y.ENUM:
				e.writeField(200, () => e.writeUleb(t.values.length)), e.writeField(201, () => e.writeList(t.values, (t) => e.writeString(t)));
				break;
			case y.AGGREGATE_STATE: break;
			case y.ARRAY:
				e.writeField(200, () => x(e, t.childType)), e.writeField(201, () => e.writeUleb(t.size));
				break;
			case y.ANY:
				e.writeField(200, () => x(e, t.targetType)), e.writeField(201, () => e.writeUleb(t.castScore));
				break;
			case y.TEMPLATE:
				e.writeField(200, () => e.writeString(t.name));
				break;
			case y.INTEGER_LITERAL: throw new d("Encoding INTEGER_LITERAL type metadata is not supported");
			case y.GEO:
				e.writeField(200, () => de(e, t.crs ?? {}));
				break;
			case y.UNBOUND:
				t.name && e.writeField(200, () => e.writeString(t.name)), t.catalog && e.writeField(201, () => e.writeString(t.catalog)), t.schema && e.writeField(202, () => e.writeString(t.schema));
				break;
			default: he(t);
		}
	});
}
function ce(e) {
	return e.readObject((e) => {
		let t = e.readRequiredField(100, () => e.readUlebNumber()), n = e.readOptionalField(101, () => e.readString(), void 0);
		e.readOptionalField(103, () => e.readNullable(() => {
			throw new d("Extension type metadata is not supported by quack-ts");
		}), void 0);
		let r = n ? { alias: n } : {};
		switch (t) {
			case y.INVALID:
			case y.GENERIC: return {
				...r,
				type: t
			};
			case y.DECIMAL: return {
				...r,
				type: t,
				width: e.readOptionalField(200, () => e.readUlebNumber(), 0),
				scale: e.readOptionalField(201, () => e.readUlebNumber(), 0)
			};
			case y.STRING: return {
				...r,
				type: t,
				collation: e.readOptionalField(200, () => e.readString(), "")
			};
			case y.LIST: return {
				...r,
				type: t,
				childType: e.readRequiredField(200, () => S(e))
			};
			case y.STRUCT: return {
				...r,
				type: t,
				childTypes: e.readOptionalField(200, () => ue(e), [])
			};
			case y.ENUM: {
				let n = e.readRequiredField(200, () => e.readUlebNumber()), i = e.readRequiredField(201, () => e.readList(() => e.readString()));
				if (i.length !== n) throw new u(`ENUM metadata declared ${n} values but serialized ${i.length}`);
				return {
					...r,
					type: t,
					values: i
				};
			}
			case y.AGGREGATE_STATE: {
				let n = e.readOptionalField(200, () => e.readString(), void 0), i = e.readOptionalField(201, () => S(e), void 0), a = e.readOptionalField(202, () => e.readList(() => S(e)), void 0);
				return {
					...r,
					type: t,
					...A("functionName", n),
					...A("returnType", i),
					...A("boundArgumentTypes", a)
				};
			}
			case y.ARRAY: return {
				...r,
				type: t,
				childType: e.readRequiredField(200, () => S(e)),
				size: e.readRequiredField(201, () => e.readUlebNumber())
			};
			case y.ANY: return {
				...r,
				type: t,
				targetType: e.readRequiredField(200, () => S(e)),
				castScore: e.readRequiredField(201, () => e.readUlebBigInt())
			};
			case y.INTEGER_LITERAL:
				if (e.peekFieldId() === 200) throw new d("INTEGER_LITERAL type metadata contains a DuckDB Value, which is not supported");
				return {
					...r,
					type: t
				};
			case y.TEMPLATE: return {
				...r,
				type: t,
				name: e.readOptionalField(200, () => e.readString(), "")
			};
			case y.GEO: return {
				...r,
				type: t,
				crs: e.readOptionalField(200, () => fe(e), {})
			};
			case y.UNBOUND:
				if (e.peekFieldId() === 204) throw new d("UNBOUND type metadata contains a ParsedExpression, which is not supported");
				let n = e.readOptionalField(200, () => e.readString(), void 0), i = e.readOptionalField(201, () => e.readString(), void 0), a = e.readOptionalField(202, () => e.readString(), void 0);
				return {
					...r,
					type: t,
					...A("name", n),
					...A("catalog", i),
					...A("schema", a)
				};
			default: throw new u(`Unknown ExtraTypeInfoType ${t}`);
		}
	});
}
function C(e) {
	switch (e.id) {
		case v.BOOLEAN: return _.BOOL;
		case v.TINYINT: return _.INT8;
		case v.UTINYINT: return _.UINT8;
		case v.SMALLINT: return _.INT16;
		case v.USMALLINT: return _.UINT16;
		case v.SQLNULL:
		case v.DATE:
		case v.INTEGER: return _.INT32;
		case v.UINTEGER: return _.UINT32;
		case v.BIGINT:
		case v.TIME:
		case v.TIME_NS:
		case v.TIMESTAMP:
		case v.TIMESTAMP_SEC:
		case v.TIMESTAMP_NS:
		case v.TIMESTAMP_MS:
		case v.TIME_TZ:
		case v.TIMESTAMP_TZ:
		case v.TIMESTAMP_TZ_NS: return _.INT64;
		case v.UBIGINT: return _.UINT64;
		case v.UHUGEINT: return _.UINT128;
		case v.HUGEINT:
		case v.UUID: return _.INT128;
		case v.FLOAT: return _.FLOAT;
		case v.DOUBLE: return _.DOUBLE;
		case v.DECIMAL: return pe(e);
		case v.BIGNUM:
		case v.VARCHAR:
		case v.CHAR:
		case v.BLOB:
		case v.BIT:
		case v.TYPE:
		case v.AGGREGATE_STATE:
		case v.GEOMETRY: return _.VARCHAR;
		case v.INTERVAL: return _.INTERVAL;
		case v.UNION:
		case v.VARIANT:
		case v.STRUCT:
		case v.TUPLE: return _.STRUCT;
		case v.LIST:
		case v.MAP: return _.LIST;
		case v.ARRAY: return _.ARRAY;
		case v.POINTER: return _.UINT64;
		case v.VALIDITY: return _.BIT;
		case v.ENUM: return me(e);
		default: return _.INVALID;
	}
}
function w(e) {
	switch (e) {
		case _.BOOL:
		case _.UINT8:
		case _.INT8:
		case _.UINT16:
		case _.INT16:
		case _.UINT32:
		case _.INT32:
		case _.UINT64:
		case _.INT64:
		case _.FLOAT:
		case _.DOUBLE:
		case _.INTERVAL:
		case _.UINT128:
		case _.INT128: return !0;
		default: return !1;
	}
}
function T(e) {
	switch (e) {
		case _.BOOL:
		case _.UINT8:
		case _.INT8: return 1;
		case _.UINT16:
		case _.INT16: return 2;
		case _.UINT32:
		case _.INT32:
		case _.FLOAT: return 4;
		case _.UINT64:
		case _.INT64:
		case _.DOUBLE: return 8;
		case _.INTERVAL:
		case _.UINT128:
		case _.INT128: return 16;
		default: throw new u(`Physical type ${e} is not fixed size`);
	}
}
function E(e) {
	let t = e.typeInfo;
	if (t?.type === y.LIST || t?.type === y.ARRAY) return t.childType;
	throw new u(`Logical type ${v[e.id] ?? e.id} does not have a child type`);
}
function D(e) {
	let t = e.typeInfo;
	if (t?.type === y.STRUCT) return t.childTypes;
	if (e.id === v.VARIANT || e.id === v.UNION) return [];
	throw new u(`Logical type ${v[e.id] ?? e.id} does not have struct children`);
}
function O(e) {
	let t = e.typeInfo;
	if (t?.type !== y.ARRAY) throw new u(`Logical type ${v[e.id] ?? e.id} is not an ARRAY`);
	return t.size;
}
function k(e) {
	let t = e.typeInfo;
	if (t?.type !== y.ENUM) throw new u(`Logical type ${v[e.id] ?? e.id} is not an ENUM`);
	return t.values;
}
function le(e, t) {
	e.writeList(t, (t) => {
		e.writeObject((e) => {
			e.writeField(0, () => e.writeString(t.name)), e.writeField(1, () => x(e, t.type));
		});
	});
}
function ue(e) {
	return e.readList(() => e.readObject((e) => ({
		name: e.readRequiredField(0, () => e.readString()),
		type: e.readRequiredField(1, () => S(e))
	})));
}
function de(e, t) {
	e.writeObject((e) => {
		t.definition && e.writeField(100, () => e.writeString(t.definition));
	});
}
function fe(e) {
	return e.readObject((e) => {
		let t = e.readOptionalField(100, () => e.readString(), void 0);
		return t === void 0 ? {} : { definition: t };
	});
}
function pe(e) {
	let t = e.typeInfo;
	if (t?.type !== y.DECIMAL) throw new u("DECIMAL type is missing DecimalTypeInfo");
	if (t.width <= 4) return _.INT16;
	if (t.width <= 9) return _.INT32;
	if (t.width <= 18) return _.INT64;
	if (t.width <= 38) return _.INT128;
	throw new u(`Unsupported DECIMAL width ${t.width}`);
}
function me(e) {
	let t = k(e);
	return t.length <= 255 ? _.UINT8 : t.length <= 65535 ? _.UINT16 : _.UINT32;
}
function he(e) {
	throw new u(`Unhandled value ${String(e)}`);
}
function A(e, t) {
	return t === void 0 ? {} : { [e]: t };
}
//#endregion
//#region src/vector.ts
var j = /* @__PURE__ */ function(e) {
	return e[e.FLAT = 0] = "FLAT", e[e.FSST = 1] = "FSST", e[e.CONSTANT = 2] = "CONSTANT", e[e.DICTIONARY = 3] = "DICTIONARY", e[e.SEQUENCE = 4] = "SEQUENCE", e[e.SHREDDED = 5] = "SHREDDED", e;
}({});
function M(e) {
	return e.readObject((e) => e.readRequiredField(300, () => P(e)));
}
function N(e, t) {
	e.writeObject((e) => {
		e.writeField(300, () => F(e, t));
	});
}
function P(e) {
	return e.readObject((e) => {
		let t = e.readRequiredField(100, () => e.readUlebNumber()), n = e.readRequiredField(101, () => e.readList(() => S(e))), r = e.readRequiredField(102, () => e.readList((r) => {
			let i = n[r];
			if (!i) throw new u(`Column vector ${r} has no matching logical type`);
			return I(e, i, t);
		}));
		if (r.length !== n.length) throw new u(`DataChunk declared ${n.length} types but serialized ${r.length} columns`);
		return {
			rowCount: t,
			types: n,
			columns: r
		};
	});
}
function F(e, t) {
	if (t.types.length !== t.columns.length) throw new u("DataChunk type count must match column count");
	e.writeObject((e) => {
		e.writeField(100, () => e.writeUleb(t.rowCount)), e.writeField(101, () => e.writeList(t.types, (t) => x(e, t))), e.writeField(102, () => e.writeList(t.columns, (n, r) => {
			let i = t.types[r];
			if (!i) throw new u(`Column ${r} has no logical type`);
			if (n.values.length !== t.rowCount) throw new u(`Column ${r} has ${n.values.length} values, expected ${t.rowCount}`);
			L(e, i, n.values, t.rowCount);
		}));
	});
}
function I(e, t, n) {
	return e.readObject((e) => z(e, t, n));
}
function L(e, t, n, r) {
	e.writeObject((e) => ye(e, t, n, r));
}
function R(e, t = e.columnNames) {
	let n = t ?? e.columns.map((e, t) => `column${t}`), r = [];
	for (let t = 0; t < e.rowCount; t++) {
		let i = {};
		for (let r = 0; r < e.columns.length; r++) {
			let a = n[r] ?? `column${r}`, o = e.columns[r];
			if (!o) throw new u(`Missing column ${r}`);
			i[a] = o.values[t] ?? null;
		}
		r.push(i);
	}
	return r;
}
function ge(e, t) {
	return e.flatMap((e) => R(e, t ? [...t] : e.columnNames));
}
function _e(e) {
	let t = e.scale, n = e.value < 0n, r = n ? -e.value : e.value;
	if (t === 0) return `${n ? "-" : ""}${r.toString()}`;
	let i = 10n ** BigInt(t), a = r / i, o = (r % i).toString().padStart(t, "0");
	return `${n ? "-" : ""}${a.toString()}.${o}`;
}
function z(e, t, n) {
	let r = e.readOptionalField(90, () => e.readUlebNumber(), j.FLAT);
	switch (r) {
		case j.FLAT: return ve(e, t, n, r);
		case j.FSST: throw new d("FSST-compressed vectors are not supported by quack-ts");
		case j.SHREDDED: throw new d("Shredded VARIANT vectors are not supported by quack-ts; cast VARIANT values to VARCHAR or JSON");
		case j.CONSTANT: {
			let i = z(e, t, +(n > 0)).values[0] ?? null;
			return {
				type: t,
				vectorType: r,
				values: Array.from({ length: n }, () => i)
			};
		}
		case j.DICTIONARY: {
			let i = e.readRequiredField(91, () => Me(e, n)), a = z(e, t, e.readRequiredField(92, () => e.readUlebNumber()));
			return {
				type: t,
				vectorType: r,
				values: i.map((e) => {
					let t = a.values[e];
					if (t === void 0) throw new u(`Dictionary selection ${e} is out of range`);
					return t;
				})
			};
		}
		case j.SEQUENCE: {
			let i = e.readRequiredField(91, () => e.readSlebBigInt()), a = e.readRequiredField(92, () => e.readSlebBigInt());
			return {
				type: t,
				vectorType: r,
				values: Array.from({ length: n }, (e, n) => He(t, i + a * BigInt(n)))
			};
		}
		default: throw new u(`Unknown vector type ${r}`);
	}
}
function ve(e, t, n, r) {
	t.id === v.GEOMETRY && e.peekFieldId() === 99 && e.readRequiredField(99, () => e.readUlebNumber());
	let i = e.readRequiredField(100, () => e.readBool()) ? e.readRequiredField(101, () => Ne(e, n)) : void 0, a = C(t);
	if (w(a)) {
		let o = T(a) * n, s = e.readRequiredField(102, () => e.readBlob());
		if (s.byteLength !== o) throw new u(`Fixed-size vector data has ${s.byteLength} bytes, expected ${o}`);
		return {
			type: t,
			vectorType: r,
			values: be(t, a, s, n, i)
		};
	}
	switch (a) {
		case _.VARCHAR: return {
			type: t,
			vectorType: r,
			values: (e.peekFieldId() === 107 ? Ae(e, n) : ke(e, n)).map((e, n) => V(i, n) ? we(t, e) : null)
		};
		case _.STRUCT: {
			let a = D(t), o = e.readRequiredField(103, () => e.readList((t) => {
				let r = a[t];
				if (!r) throw new u(`STRUCT child vector ${t} has no matching type metadata`);
				return I(e, r.type, n);
			}));
			return {
				type: t,
				vectorType: r,
				values: Array.from({ length: n }, (e, n) => {
					if (!V(i, n)) return null;
					if (t.id === v.TUPLE) return o.map((e) => e.values[n] ?? null);
					let r = {};
					for (let e = 0; e < a.length; e++) {
						let t = a[e], i = o[e];
						if (!t || !i) throw new u(`STRUCT child ${e} is incomplete`);
						r[t.name] = i.values[n] ?? null;
					}
					return r;
				})
			};
		}
		case _.LIST: {
			let a = e.readRequiredField(104, () => e.readUlebNumber()), o = e.readRequiredField(105, () => Fe(e, n)), s = E(t), c = e.readRequiredField(106, () => I(e, s, a));
			return {
				type: t,
				vectorType: r,
				values: o.map((e, t) => V(i, t) ? c.values.slice(e.offset, e.offset + e.length) : null)
			};
		}
		case _.ARRAY: {
			let a = e.readRequiredField(103, () => e.readUlebNumber()), o = O(t);
			if (a !== o) throw new u(`ARRAY vector serialized size ${a}, expected ${o}`);
			let s = E(t), c = e.readRequiredField(104, () => I(e, s, a * n));
			return {
				type: t,
				vectorType: r,
				values: Array.from({ length: n }, (e, t) => {
					if (!V(i, t)) return null;
					let n = t * a;
					return c.values.slice(n, n + a);
				})
			};
		}
		default: throw new d(`Variable-width physical type ${_[a] ?? a} is not supported`);
	}
}
function ye(e, t, n, r) {
	if (n.length !== r) throw new u(`Vector value count ${n.length} does not match row count ${r}`);
	t.id === v.GEOMETRY && e.writeField(99, () => e.writeUleb(1));
	let i = n.map((e) => e !== null), a = i.some((e) => !e);
	e.writeField(100, () => e.writeBool(a)), a && e.writeField(101, () => e.writeBlob(Pe(i)));
	let o = C(t);
	if (w(o)) {
		let i = new f(Math.max(16, T(o) * r));
		for (let e of n) Se(i, t, o, e);
		e.writeField(102, () => e.writeBlob(i.toUint8Array()));
		return;
	}
	switch (o) {
		case _.VARCHAR: {
			let r = n.map((e) => Te(t, e));
			t.id === v.GEOMETRY ? e.writeField(102, () => e.writeList(r, (t) => e.writeStringBytes(t))) : je(e, r);
			return;
		}
		case _.STRUCT:
			Ee(e, t, n, r);
			return;
		case _.LIST:
			De(e, t, n);
			return;
		case _.ARRAY:
			Oe(e, t, n);
			return;
		default: throw new d(`Cannot encode physical type ${_[o] ?? o}`);
	}
}
function be(e, t, n, r, i) {
	let a = new p(n), o = [];
	for (let n = 0; n < r; n++) {
		let r = xe(a, e, t);
		o.push(V(i, n) ? r : null);
	}
	return a.assertEof(), o;
}
function xe(e, t, n) {
	switch (n) {
		case _.BOOL: return e.readFixedUint8() !== 0;
		case _.INT8: return e.readFixedInt8();
		case _.UINT8: return H(t, e.readFixedUint8());
		case _.INT16: {
			let n = e.readFixedInt16();
			return t.id === v.DECIMAL ? G(t, BigInt(n)) : n;
		}
		case _.UINT16: return H(t, e.readFixedUint16());
		case _.INT32: {
			let n = e.readFixedInt32();
			return t.id === v.DATE ? {
				kind: "date",
				days: n
			} : t.id === v.DECIMAL ? G(t, BigInt(n)) : n;
		}
		case _.UINT32: return H(t, e.readFixedUint32());
		case _.INT64: return W(t, e.readFixedInt64());
		case _.UINT64: return e.readFixedUint64();
		case _.FLOAT: return e.readFixedFloat32();
		case _.DOUBLE: return e.readFixedFloat64();
		case _.INT128: {
			let n = e.readFixedUint64(), r = e.readFixedInt64();
			if (t.id === v.UUID) return Ue(r, n);
			let i = ie({
				upper: r,
				lower: n
			});
			return t.id === v.DECIMAL ? G(t, i) : i;
		}
		case _.UINT128: {
			let t = e.readFixedUint64();
			return ae({
				upper: e.readFixedUint64(),
				lower: t
			});
		}
		case _.INTERVAL: return {
			kind: "interval",
			months: e.readFixedInt32(),
			days: e.readFixedInt32(),
			micros: e.readFixedInt64()
		};
		default: throw new d(`Cannot decode fixed physical type ${_[n] ?? n}`);
	}
}
function Se(e, t, n, r) {
	if (r === null) {
		Ce(e, n);
		return;
	}
	switch (n) {
		case _.BOOL:
			e.writeFixedUint8(+(r === !0));
			return;
		case _.INT8:
			e.writeFixedInt8(Number(r));
			return;
		case _.UINT8:
			e.writeFixedUint8(U(t, r));
			return;
		case _.INT16:
			e.writeFixedInt16(Number(ze(t, r)));
			return;
		case _.UINT16:
			e.writeFixedUint16(U(t, r));
			return;
		case _.INT32:
			e.writeFixedInt32(Number(Be(t, r)));
			return;
		case _.UINT32:
			e.writeFixedUint32(U(t, r));
			return;
		case _.INT64:
			e.writeFixedInt64(Le(t, r));
			return;
		case _.UINT64:
			e.writeFixedUint64(q(r));
			return;
		case _.FLOAT:
			e.writeFixedFloat32(Number(r));
			return;
		case _.DOUBLE:
			e.writeFixedFloat64(Number(r));
			return;
		case _.INT128: {
			let n = t.id === v.UUID ? We(String(r)) : h(Re(t, r));
			e.writeFixedUint64(n.lower), e.writeFixedInt64(n.upper);
			return;
		}
		case _.UINT128: {
			let t = q(r);
			e.writeFixedUint64(BigInt.asUintN(64, t)), e.writeFixedUint64(BigInt.asUintN(64, t >> 64n));
			return;
		}
		case _.INTERVAL: {
			let t = r;
			e.writeFixedInt32(t.months ?? 0), e.writeFixedInt32(t.days ?? 0), e.writeFixedInt64(t.micros ?? 0n);
			return;
		}
		default: throw new d(`Cannot encode fixed physical type ${_[n] ?? n}`);
	}
}
function Ce(e, t) {
	e.writeBytes(new Uint8Array(T(t)));
}
function we(e, t) {
	switch (e.id) {
		case v.BLOB:
		case v.GEOMETRY:
		case v.BIT: return t;
		default: return new TextDecoder().decode(t);
	}
}
function Te(e, t) {
	if (t === null) return new Uint8Array();
	switch (e.id) {
		case v.BLOB:
		case v.GEOMETRY:
		case v.BIT: return t instanceof Uint8Array ? t : new TextEncoder().encode(String(t));
		default: return new TextEncoder().encode(String(t));
	}
}
function Ee(e, t, n, r) {
	let i = D(t), a = t.id === v.TUPLE;
	e.writeField(103, () => e.writeList(i, (t, i) => {
		let o = n.map((e) => a && Array.isArray(e) ? e[i] ?? null : e === null || Array.isArray(e) || typeof e != "object" || e instanceof Uint8Array ? null : e[t.name] ?? null);
		L(e, t.type, o, r);
	}));
}
function De(e, t, n) {
	let r = E(t), i = [], a = [];
	for (let e of n) {
		if (e === null) {
			i.push({
				offset: 0,
				length: 0
			});
			continue;
		}
		if (!Array.isArray(e)) throw new u("LIST/MAP values must be arrays");
		let t = a.length;
		a.push(...e), i.push({
			offset: t,
			length: e.length
		});
	}
	e.writeField(104, () => e.writeUleb(a.length)), e.writeField(105, () => Ie(e, i)), e.writeField(106, () => L(e, r, a, a.length));
}
function Oe(e, t, n) {
	let r = E(t), i = O(t), a = [];
	for (let e of n) {
		if (e === null) {
			for (let e = 0; e < i; e++) a.push(null);
			continue;
		}
		if (!Array.isArray(e) || e.length !== i) throw new u(`ARRAY values must be arrays of length ${i}`);
		a.push(...e);
	}
	e.writeField(103, () => e.writeUleb(i)), e.writeField(104, () => L(e, r, a, a.length));
}
function ke(e, t) {
	let n = e.readRequiredField(102, () => e.readList(() => e.readStringBytes()));
	if (n.length !== t) throw new u(`String vector serialized ${n.length} entries for ${t} rows`);
	return n;
}
function Ae(e, t) {
	let n = e.readRequiredField(107, () => e.readUlebNumber()), r = e.readRequiredField(108, () => e.readBlob()), i = e.readRequiredField(109, () => e.readBlob());
	if (r.byteLength !== t * 4) throw new u(`String length data has ${r.byteLength} bytes, expected ${t * 4}`);
	if (i.byteLength !== n) throw new u(`String byte data has ${i.byteLength} bytes, expected ${n}`);
	let a = new DataView(r.buffer, r.byteOffset, r.byteLength), o = [], s = 0;
	for (let e = 0; e < t; e++) {
		let t = a.getUint32(e * 4, !0);
		if (s + t > i.byteLength) throw new u("String lengths exceed the serialized string data");
		o.push(i.subarray(s, s + t)), s += t;
	}
	return o;
}
function je(e, t) {
	let n = new Uint8Array(t.length * 4), r = new DataView(n.buffer), i = 0;
	t.forEach((e, t) => {
		r.setUint32(t * 4, e.byteLength, !0), i += e.byteLength;
	});
	let a = new Uint8Array(i), o = 0;
	for (let e of t) a.set(e, o), o += e.byteLength;
	e.writeField(107, () => e.writeUleb(i)), e.writeField(108, () => e.writeBlob(n)), e.writeField(109, () => e.writeBlob(a));
}
function Me(e, t) {
	let n = t * 4, r = e.readBlob();
	if (r.byteLength !== n) throw new u(`Selection vector has ${r.byteLength} bytes, expected ${n}`);
	let i = new DataView(r.buffer, r.byteOffset, r.byteLength);
	return Array.from({ length: t }, (e, t) => i.getUint32(t * 4, !0));
}
function Ne(e, t) {
	let n = B(t), r = e.readBlob();
	if (r.byteLength !== n) throw new u(`Validity mask has ${r.byteLength} bytes, expected ${n}`);
	return Array.from({ length: t }, (e, t) => ((r[Math.floor(t / 8)] ?? 0) & 1 << t % 8) != 0);
}
function Pe(e) {
	let t = new Uint8Array(B(e.length)).fill(255);
	for (let n = 0; n < e.length; n++) if (!e[n]) {
		let e = Math.floor(n / 8);
		t[e] = (t[e] ?? 0) & ~(1 << n % 8);
	}
	return t;
}
function B(e) {
	return Math.ceil(e / 64) * 8;
}
function V(e, t) {
	return e ? e[t] === !0 : !0;
}
function Fe(e, t) {
	let n = e.readList(() => e.readObject((e) => ({
		offset: e.readRequiredField(100, () => e.readUlebNumber()),
		length: e.readRequiredField(101, () => e.readUlebNumber())
	})));
	if (n.length !== t) throw new u(`LIST vector serialized ${n.length} entries for ${t} rows`);
	return n;
}
function Ie(e, t) {
	e.writeList(t, (t) => {
		e.writeObject((e) => {
			e.writeField(100, () => e.writeUleb(t.offset)), e.writeField(101, () => e.writeUleb(t.length));
		});
	});
}
function H(e, t) {
	if (e.id !== v.ENUM) return t;
	let n = k(e)[t];
	if (n === void 0) throw new u(`ENUM index ${t} is out of range`);
	return n;
}
function U(e, t) {
	if (e.id !== v.ENUM) return Number(t);
	if (typeof t == "number") return t;
	let n = k(e).indexOf(String(t));
	if (n < 0) throw new u(`Unknown ENUM value ${String(t)}`);
	return n;
}
function W(e, t) {
	switch (e.id) {
		case v.TIME: return {
			kind: "time",
			unit: "micros",
			value: t
		};
		case v.TIME_NS: return {
			kind: "time",
			unit: "nanos",
			value: t
		};
		case v.TIME_TZ: return {
			kind: "time_tz",
			bits: t
		};
		case v.TIMESTAMP_SEC: return {
			kind: "timestamp",
			unit: "seconds",
			value: t
		};
		case v.TIMESTAMP_MS: return {
			kind: "timestamp",
			unit: "millis",
			value: t
		};
		case v.TIMESTAMP: return {
			kind: "timestamp",
			unit: "micros",
			value: t
		};
		case v.TIMESTAMP_NS: return {
			kind: "timestamp",
			unit: "nanos",
			value: t
		};
		case v.TIMESTAMP_TZ: return {
			kind: "timestamp",
			unit: "micros",
			value: t,
			timezone: "utc"
		};
		case v.TIMESTAMP_TZ_NS: return {
			kind: "timestamp",
			unit: "nanos",
			value: t,
			timezone: "utc"
		};
		case v.DECIMAL: return G(e, t);
		default: return t;
	}
}
function Le(e, t) {
	if (e.id === v.DECIMAL) return K(e, t);
	if (typeof t == "object" && t && !(t instanceof Uint8Array) && !Array.isArray(t)) {
		let e = t;
		if (e.kind === "time" || e.kind === "timestamp") return BigInt(e.value);
		if (e.kind === "time_tz") return BigInt(e.bits);
	}
	return q(t);
}
function Re(e, t) {
	return e.id === v.DECIMAL ? K(e, t) : q(t);
}
function ze(e, t) {
	return e.id === v.DECIMAL ? K(e, t) : q(t);
}
function Be(e, t) {
	return e.id === v.DATE ? typeof t == "object" && t && !Array.isArray(t) && !(t instanceof Uint8Array) ? BigInt(t.days) : q(t) : ze(e, t);
}
function G(e, t) {
	let n = e.typeInfo;
	if (n?.type !== y.DECIMAL) throw new u("DECIMAL value is missing DecimalTypeInfo");
	return {
		kind: "decimal",
		value: t,
		width: n.width,
		scale: n.scale
	};
}
function K(e, t) {
	if (typeof t == "object" && t && !Array.isArray(t) && !(t instanceof Uint8Array)) {
		let e = t;
		if (e.kind === "decimal") return BigInt(e.value);
	}
	return typeof t == "string" ? Ve(e, t) : q(t);
}
function Ve(e, t) {
	let n = e.typeInfo;
	if (n?.type !== y.DECIMAL) throw new u("DECIMAL value is missing DecimalTypeInfo");
	let r = t.trim(), i = r.startsWith("-"), [a = "0", o = ""] = (i || r.startsWith("+") ? r.slice(1) : r).split("."), s = o.padEnd(n.scale, "0").slice(0, n.scale), c = BigInt(`${a}${s}` || "0");
	return i ? -c : c;
}
function q(e) {
	if (typeof e == "bigint") return e;
	if (typeof e == "number" || typeof e == "string" || typeof e == "boolean") return BigInt(e);
	throw new u(`Cannot convert ${String(e)} to bigint`);
}
function He(e, t) {
	switch (e.id) {
		case v.INTEGER:
		case v.DATE: return e.id === v.DATE ? {
			kind: "date",
			days: Number(t)
		} : Number(t);
		case v.BIGINT: return t;
		default: return W(e, t);
	}
}
function Ue(e, t) {
	let n = `${(BigInt.asUintN(64, e) ^ 1n << 63n).toString(16).padStart(16, "0")}${t.toString(16).padStart(16, "0")}`;
	return `${n.slice(0, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}-${n.slice(20)}`;
}
function We(e) {
	let t = e.replaceAll("-", "").toLowerCase();
	if (!/^[0-9a-f]{32}$/.test(t)) throw new u(`Invalid UUID string ${e}`);
	let n = BigInt(`0x${t.slice(0, 16)}`), r = BigInt(`0x${t.slice(16)}`);
	return {
		upper: BigInt.asIntN(64, n ^ 1n << 63n),
		lower: r
	};
}
//#endregion
//#region src/messages.ts
var J = /* @__PURE__ */ function(e) {
	return e[e.INVALID = 0] = "INVALID", e[e.CONNECTION_REQUEST = 1] = "CONNECTION_REQUEST", e[e.CONNECTION_RESPONSE = 2] = "CONNECTION_RESPONSE", e[e.PREPARE_REQUEST = 3] = "PREPARE_REQUEST", e[e.PREPARE_RESPONSE = 4] = "PREPARE_RESPONSE", e[e.FETCH_REQUEST = 7] = "FETCH_REQUEST", e[e.FETCH_RESPONSE = 8] = "FETCH_RESPONSE", e[e.SEND_DATA_REQUEST = 9] = "SEND_DATA_REQUEST", e[e.SUCCESS_RESPONSE = 10] = "SUCCESS_RESPONSE", e[e.DISCONNECT_MESSAGE = 11] = "DISCONNECT_MESSAGE", e[e.CANCEL_REQUEST = 12] = "CANCEL_REQUEST", e[e.SEND_DATA_RESPONSE = 14] = "SEND_DATA_RESPONSE", e[e.ACKNOWLEDGEMENT = 15] = "ACKNOWLEDGEMENT", e[e.HEARTBEAT_REQUEST = 16] = "HEARTBEAT_REQUEST", e[e.ERROR_RESPONSE = 100] = "ERROR_RESPONSE", e;
}({});
function Ge(e) {
	let t = new f();
	return qe(t, e), Ye(t, e), Ze(t, e), t.toUint8Array();
}
function Ke(e) {
	let t = new p(e), n = Xe(t, Je(t));
	return t.assertEof(), n;
}
function qe(e, t) {
	e.writeObject((e) => {
		e.writeField(1, () => e.writeUleb(t.type)), t.connectionId && e.writeField(2, () => e.writeString(t.connectionId)), e.writeField(3, () => e.writeUleb(t.clientQueryId ?? 18446744073709551615n));
	});
}
function Je(e) {
	return e.readObject((e) => {
		let t = e.readRequiredField(1, () => e.readUlebNumber()), n = e.readOptionalField(2, () => e.readString(), ""), r = e.readRequiredField(3, () => e.readUlebBigInt());
		return {
			type: t,
			...n ? { connectionId: n } : {},
			...r === 18446744073709551615n ? {} : { clientQueryId: r }
		};
	});
}
function Ye(e, t) {
	switch (t.type) {
		case J.CONNECTION_REQUEST:
			e.writeObject((e) => {
				Y(e, 1, t.authString), Y(e, 2, t.clientDuckdbVersion), Y(e, 3, t.clientPlatform), X(e, 4, t.minSupportedQuackVersion), X(e, 5, t.maxSupportedQuackVersion), Y(e, 6, t.clientId), X(e, 7, t.heartbeatTimeoutSeconds);
			});
			return;
		case J.CONNECTION_RESPONSE:
			e.writeObject((e) => {
				Y(e, 1, t.serverDuckdbVersion), Y(e, 2, t.serverPlatform), X(e, 3, t.quackVersion), X(e, 4, t.heartbeatTimeoutSeconds);
			});
			return;
		case J.PREPARE_REQUEST:
			e.writeObject((e) => {
				Y(e, 1, t.sql), e.writeField(2, () => e.writeHugeInt(t.queryUuid)), Z(e, 3, t.inlineRows);
			});
			return;
		case J.PREPARE_RESPONSE:
			e.writeObject((e) => {
				t.resultTypes.length && e.writeField(1, () => e.writeList(t.resultTypes, (t) => x(e, t))), t.resultNames.length && e.writeField(2, () => e.writeList(t.resultNames, (t) => e.writeString(t))), t.needsMoreFetch && e.writeField(3, () => e.writeBool(t.needsMoreFetch)), t.results.length && e.writeField(4, () => et(e, t.results)), e.writeField(5, () => e.writeHugeInt(t.queryUuid));
			});
			return;
		case J.FETCH_REQUEST:
			e.writeObject((e) => {
				e.writeField(1, () => e.writeHugeInt(t.queryUuid)), X(e, 2, t.batchIndex), X(e, 3, t.ackIndex);
			});
			return;
		case J.FETCH_RESPONSE:
			e.writeObject((e) => {
				X(e, 1, t.results.length), Z(e, 2, t.totalBatches), Z(e, 3, t.batchIndex);
			});
			return;
		case J.SEND_DATA_REQUEST:
			e.writeObject((e) => {
				Y(e, 1, t.streamId), X(e, 2, t.chunks.length), Z(e, 3, t.totalBatches), Z(e, 4, t.batchIndex);
			});
			return;
		case J.SEND_DATA_RESPONSE:
			e.writeObject((e) => {
				e.writeField(1, () => e.writeUleb(t.acceptBudget ?? 18446744073709551615n));
			});
			return;
		case J.CANCEL_REQUEST:
			e.writeObject((e) => {
				e.writeField(1, () => e.writeHugeInt(t.queryUuid));
			});
			return;
		case J.ACKNOWLEDGEMENT:
			e.writeObject((e) => {
				nt(t.queryUuid) || e.writeField(1, () => e.writeHugeInt(t.queryUuid));
			});
			return;
		case J.SUCCESS_RESPONSE:
		case J.DISCONNECT_MESSAGE:
		case J.HEARTBEAT_REQUEST:
			e.writeObject(() => void 0);
			return;
		case J.ERROR_RESPONSE:
			e.writeObject((e) => {
				Y(e, 1, t.message), Y(e, 2, t.exceptionType);
				let n = Object.entries(t.extraInfo ?? {});
				n.length && e.writeField(3, () => e.writeList(n, ([t, n]) => e.writeObject((e) => {
					e.writeField(0, () => e.writeString(t)), e.writeField(1, () => e.writeString(n));
				}))), t.mustInvalidate && e.writeField(4, () => e.writeBool(!0));
			});
			return;
		default: throw new u(`Cannot encode unsupported message type ${t.type}`);
	}
}
function Xe(e, t) {
	switch (t.type) {
		case J.CONNECTION_REQUEST: return e.readObject((e) => ({
			...t,
			type: J.CONNECTION_REQUEST,
			...$("authString", e.readOptionalField(1, () => e.readString(), void 0)),
			...$("clientDuckdbVersion", e.readOptionalField(2, () => e.readString(), void 0)),
			...$("clientPlatform", e.readOptionalField(3, () => e.readString(), void 0)),
			minSupportedQuackVersion: e.readOptionalField(4, () => e.readUlebBigInt(), 0n),
			maxSupportedQuackVersion: e.readOptionalField(5, () => e.readUlebBigInt(), 0n),
			...$("clientId", e.readOptionalField(6, () => e.readString(), void 0)),
			heartbeatTimeoutSeconds: e.readOptionalField(7, () => e.readUlebBigInt(), 0n)
		}));
		case J.CONNECTION_RESPONSE: return e.readObject((e) => ({
			...t,
			type: J.CONNECTION_RESPONSE,
			...$("serverDuckdbVersion", e.readOptionalField(1, () => e.readString(), void 0)),
			...$("serverPlatform", e.readOptionalField(2, () => e.readString(), void 0)),
			...$("quackVersion", e.readOptionalField(3, () => e.readUlebBigInt(), void 0)),
			...$("heartbeatTimeoutSeconds", e.readOptionalField(4, () => e.readUlebBigInt(), void 0))
		}));
		case J.PREPARE_REQUEST: return e.readObject((e) => {
			let n = e.readOptionalField(1, () => e.readString(), ""), r = e.readRequiredField(2, () => e.readHugeInt()), i = Q(e, 3);
			return {
				...t,
				type: J.PREPARE_REQUEST,
				sql: n,
				queryUuid: r,
				...$("inlineRows", i)
			};
		});
		case J.PREPARE_RESPONSE: return e.readObject((e) => ({
			...t,
			type: J.PREPARE_RESPONSE,
			resultTypes: e.readOptionalField(1, () => e.readList(() => S(e)), []),
			resultNames: e.readOptionalField(2, () => e.readList(() => e.readString()), []),
			needsMoreFetch: e.readOptionalField(3, () => e.readBool(), !1),
			results: e.readOptionalField(4, () => $e(e), []),
			queryUuid: e.readRequiredField(5, () => e.readHugeInt())
		}));
		case J.FETCH_REQUEST: return e.readObject((e) => ({
			...t,
			type: J.FETCH_REQUEST,
			queryUuid: e.readRequiredField(1, () => e.readHugeInt()),
			batchIndex: e.readOptionalField(2, () => e.readUlebBigInt(), 0n),
			ackIndex: e.readOptionalField(3, () => e.readUlebBigInt(), 0n)
		}));
		case J.FETCH_RESPONSE: {
			let n = e.readObject((e) => ({
				chunkCount: e.readOptionalField(1, () => e.readUlebNumber(), 0),
				totalBatches: Q(e, 2),
				batchIndex: Q(e, 3)
			}));
			return {
				...t,
				type: J.FETCH_RESPONSE,
				results: Qe(e, n.chunkCount),
				...$("batchIndex", n.batchIndex),
				...$("totalBatches", n.totalBatches)
			};
		}
		case J.SEND_DATA_REQUEST: {
			let n = e.readObject((e) => ({
				streamId: e.readOptionalField(1, () => e.readString(), ""),
				chunkCount: e.readOptionalField(2, () => e.readUlebNumber(), 0),
				totalBatches: Q(e, 3),
				batchIndex: Q(e, 4)
			}));
			return {
				...t,
				type: J.SEND_DATA_REQUEST,
				streamId: n.streamId,
				chunks: Qe(e, n.chunkCount),
				...$("batchIndex", n.batchIndex),
				...$("totalBatches", n.totalBatches)
			};
		}
		case J.SEND_DATA_RESPONSE: return e.readObject((e) => ({
			...t,
			type: J.SEND_DATA_RESPONSE,
			...$("acceptBudget", Q(e, 1))
		}));
		case J.CANCEL_REQUEST: return e.readObject((e) => ({
			...t,
			type: J.CANCEL_REQUEST,
			queryUuid: e.readRequiredField(1, () => e.readHugeInt())
		}));
		case J.ACKNOWLEDGEMENT: return e.readObject((e) => ({
			...t,
			type: J.ACKNOWLEDGEMENT,
			queryUuid: e.readOptionalField(1, () => e.readHugeInt(), {
				upper: 0n,
				lower: 0n
			})
		}));
		case J.SUCCESS_RESPONSE: return e.readObject(() => ({
			...t,
			type: J.SUCCESS_RESPONSE
		}));
		case J.DISCONNECT_MESSAGE: return e.readObject(() => ({
			...t,
			type: J.DISCONNECT_MESSAGE
		}));
		case J.HEARTBEAT_REQUEST: return e.readObject(() => ({
			...t,
			type: J.HEARTBEAT_REQUEST
		}));
		case J.ERROR_RESPONSE: return e.readObject((e) => {
			let n = e.readOptionalField(1, () => e.readString(), ""), r = e.readOptionalField(2, () => e.readString(), void 0), i = e.readOptionalField(3, () => tt(e), void 0), a = e.readOptionalField(4, () => e.readBool(), !1);
			return {
				...t,
				type: J.ERROR_RESPONSE,
				message: n,
				...$("exceptionType", r),
				...$("extraInfo", i),
				...a ? { mustInvalidate: a } : {}
			};
		});
		default: throw new u(`Cannot decode unsupported message type ${t.type}`);
	}
}
function Ze(e, t) {
	let n = t.type === J.FETCH_RESPONSE ? t.results : t.type === J.SEND_DATA_REQUEST ? t.chunks : [];
	for (let t of n) F(e, t);
}
function Qe(e, t) {
	let n = [];
	for (let r = 0; r < t; r++) n.push(P(e));
	return n;
}
function $e(e) {
	return e.readList(() => {
		let t = e.readNullable(() => M(e));
		if (!t) throw new u("Encountered null DataChunk pointer in result list");
		return t;
	});
}
function et(e, t) {
	e.writeList(t, (t) => e.writeNullable(t, (t) => N(e, t)));
}
function tt(e) {
	let t = {};
	return e.readList(() => e.readObject((e) => {
		let n = e.readRequiredField(0, () => e.readString());
		t[n] = e.readRequiredField(1, () => e.readString());
	})), t;
}
function Y(e, t, n) {
	n !== void 0 && n !== "" && e.writeField(t, () => e.writeString(n));
}
function X(e, t, n) {
	n !== void 0 && BigInt(n) !== 0n && e.writeField(t, () => e.writeUleb(n));
}
function Z(e, t, n) {
	n !== void 0 && e.writeField(t, () => e.writeUleb(n));
}
function Q(e, t) {
	let n = e.readOptionalField(t, () => e.readUlebBigInt(), a);
	return n === 18446744073709551615n ? void 0 : n;
}
function nt(e) {
	return typeof e == "bigint" ? e === 0n : e.upper === 0n && e.lower === 0n;
}
function $(e, t) {
	return t === void 0 ? {} : { [e]: t };
}
//#endregion
export { b as A, u as B, x as C, C as D, k as E, ie as F, r as G, d as H, ae as I, a as J, i as K, re as L, p as M, f as N, D as O, m as P, h as R, se as S, E as T, o as U, ee as V, t as W, e as X, n as Y, c as Z, v as _, Ge as a, ce as b, _e as c, I as d, F as f, y as g, R as h, qe as i, T as j, w as k, P as l, L as m, Je as n, j as o, N as p, s as q, Ke as r, ge as s, J as t, M as u, oe as v, O as w, S as x, _ as y, l as z };
