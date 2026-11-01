import { A as e, B as t, C as n, D as r, E as i, F as a, G as o, H as s, I as c, J as l, K as u, L as ee, M as te, N as ne, O as d, P as re, R as ie, S as ae, T as f, U as oe, V as p, W as m, X as se, Y as ce, Z as h, _ as g, a as le, b as ue, c as _, d as de, f as fe, g as v, h as pe, i as me, j as he, k as ge, l as _e, m as ve, n as ye, o as be, p as xe, q as Se, r as Ce, s as y, t as b, u as we, v as x, w as S, x as Te, y as Ee, z as De } from "./messages-BsNzlNiY.js";
import { Column as Oe, CompressionType as ke, Endianness as Ae, IntervalUnit as je, Table as C, TimeUnit as w, Type as T, Version as Me, batchType as Ne, binary as Pe, bool as Fe, dateDay as Ie, decimal128 as Le, decimal256 as Re, decimal32 as ze, decimal64 as Be, fixedSizeList as Ve, float32 as He, float64 as Ue, int16 as We, int32 as Ge, int64 as Ke, int8 as qe, interval as Je, list as Ye, map as Xe, nullType as Ze, struct as Qe, tableFromIPC as $e, tableToIPC as et, timeMicrosecond as tt, timeNanosecond as nt, timestamp as E, uint16 as rt, uint32 as it, uint64 as at, uint8 as ot, utf8 as st } from "./flechette.mjs";
//#region src/values.ts
function ct(e, t, n) {
	return {
		kind: "decimal",
		value: yt(e, n),
		width: t,
		scale: n
	};
}
function lt(e) {
	return {
		kind: "date",
		days: e
	};
}
function ut(e) {
	return lt(Math.trunc(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()) / 864e5));
}
function dt(e) {
	let n = Date.parse(`${e}T00:00:00.000Z`);
	if (!Number.isFinite(n)) throw new t(`Invalid ISO date ${e}`);
	return lt(Math.trunc(n / 864e5));
}
function ft(e) {
	return /* @__PURE__ */ new Date(e.days * 864e5);
}
function pt(e, t = "micros") {
	return {
		kind: "time",
		unit: t,
		value: BigInt(e)
	};
}
function mt(e) {
	return {
		kind: "time_tz",
		bits: BigInt(e)
	};
}
function ht(e, t = "micros", n) {
	return n === void 0 ? {
		kind: "timestamp",
		unit: t,
		value: BigInt(e)
	} : {
		kind: "timestamp",
		unit: t,
		value: BigInt(e),
		timezone: n
	};
}
function gt(e, t = "micros", n) {
	let r = BigInt(e.getTime());
	return ht(t === "seconds" ? r / 1000n : t === "millis" ? r : t === "nanos" ? r * 1000000n : r * 1000n, t, n);
}
function _t(e) {
	let t = e.unit === "seconds" ? e.value * 1000n : e.unit === "millis" ? e.value : e.unit === "nanos" ? e.value / 1000000n : e.value / 1000n;
	return new Date(Number(t));
}
function vt(e = 0, t = 0, n = 0n) {
	return {
		kind: "interval",
		months: e,
		days: t,
		micros: BigInt(n)
	};
}
function yt(e, n) {
	if (typeof e == "bigint") return e;
	let r = String(e).trim(), i = r.startsWith("-"), [a = "0", o = ""] = (i || r.startsWith("+") ? r.slice(1) : r).split(".");
	if (!/^\d+$/.test(a || "0") || !/^\d*$/.test(o)) throw new t(`Invalid decimal value ${String(e)}`);
	let s = o.padEnd(n, "0").slice(0, n), c = BigInt(`${a || "0"}${s}` || "0");
	return i ? -c : c;
}
//#endregion
//#region src/builders.ts
function D(e, t, n) {
	return n ? {
		name: n,
		type: e,
		values: t
	} : {
		type: e,
		values: t
	};
}
function O(e) {
	if (e.length === 0) throw new t("A Quack DataChunk must contain at least one column");
	let n = e[0]?.values.length ?? 0, r = [], i = [], a = [];
	for (let o = 0; o < e.length; o++) {
		let s = e[o];
		if (!s) throw new t(`Missing column ${o}`);
		if (s.values.length !== n) throw new t(`Column ${o} has ${s.values.length} values, expected ${n}`);
		i.push(s.type), a.push(s.name ?? `column${o}`), r.push({
			type: s.type,
			vectorType: be.FLAT,
			values: [...s.values]
		});
	}
	return {
		rowCount: n,
		types: i,
		columns: r,
		columnNames: a
	};
}
function k(e, t = {}) {
	return O(bt(e, t.columns).map((t) => D(t.type, e.map((e) => j(e[t.name], t.type)), t.name)));
}
function bt(e, n) {
	if (Array.isArray(n)) return n.map((e) => ({
		name: e.name,
		type: e.type
	}));
	if (n) return Object.entries(n).map(([e, n]) => {
		if (!n) throw new t(`Column ${e} is missing a logical type`);
		return {
			name: e,
			type: n
		};
	});
	let r = e[0];
	if (!r) throw new t("Cannot infer append row columns from an empty row set");
	return Object.keys(r).map((t) => ({
		name: t,
		type: A(e.map((e) => e[t]))
	}));
}
function A(e) {
	let n = e.find((e) => e != null);
	if (n == null) throw new t("Cannot infer logical type from only null values");
	if (typeof n == "boolean") return x.boolean();
	if (typeof n == "bigint") return x.bigint();
	if (typeof n == "number") return Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 ? x.integer() : x.double();
	if (typeof n == "string") return x.varchar();
	if (n instanceof Uint8Array) return x.blob();
	if (n instanceof Date) return x.timestamp();
	if (Array.isArray(n)) {
		let t = e.flatMap((e) => Array.isArray(e) ? e : []);
		return x.list(A(t));
	}
	if (wt(n)) return x.decimal(n.width, n.scale);
	if (Tt(n)) return x.date();
	if (Et(n)) return n.unit === "nanos" ? x.timeNs() : x.time();
	if (Dt(n)) return x.timeTz();
	if (Ot(n)) switch (n.unit) {
		case "seconds": return x.timestampSeconds();
		case "millis": return x.timestampMillis();
		case "nanos": return n.timezone === "utc" ? x.timestampTzNanos() : x.timestampNanos();
		default: return n.timezone === "utc" ? x.timestampTz() : x.timestamp();
	}
	if (kt(n)) return x.interval();
	if (typeof n == "object") return x.struct(Object.keys(n).map((t) => ({
		name: t,
		type: A(e.map((e) => e && typeof e == "object" && !Array.isArray(e) && !(e instanceof Uint8Array) ? e[t] : null))
	})));
	throw new t(`Cannot infer logical type for value ${String(n)}`);
}
function j(e, t) {
	if (e == null) return null;
	if (e instanceof Date) {
		if (t.id === g.DATE) return ut(e);
		if (xt(t)) return gt(e, Ct(t), St(t) ? "utc" : void 0);
	}
	if (Array.isArray(e)) {
		let n = t.id === g.LIST || t.id === g.MAP || t.id === g.ARRAY ? f(t) : void 0;
		return n ? e.map((e) => j(e, n)) : e.map((e) => j(e, x.varchar()));
	}
	if (typeof e == "object" && !(e instanceof Uint8Array)) {
		if (t.id === g.STRUCT) {
			let n = d(t), r = e, i = {};
			for (let e of n) i[e.name] = j(r[e.name], e.type);
			return i;
		}
		if (t.id === g.MAP && Array.isArray(e)) {
			let n = f(t);
			return e.map((e) => j(e, n));
		}
	}
	return e;
}
function xt(e) {
	return e.id === g.TIMESTAMP || e.id === g.TIMESTAMP_SEC || e.id === g.TIMESTAMP_MS || e.id === g.TIMESTAMP_NS || St(e);
}
function St(e) {
	return e.id === g.TIMESTAMP_TZ || e.id === g.TIMESTAMP_TZ_NS;
}
function Ct(e) {
	switch (e.id) {
		case g.TIMESTAMP_SEC: return "seconds";
		case g.TIMESTAMP_MS: return "millis";
		case g.TIMESTAMP_NS:
		case g.TIMESTAMP_TZ_NS: return "nanos";
		default: return "micros";
	}
}
function wt(e) {
	return typeof e == "object" && !!e && e.kind === "decimal";
}
function Tt(e) {
	return typeof e == "object" && !!e && e.kind === "date";
}
function Et(e) {
	return typeof e == "object" && !!e && e.kind === "time";
}
function Dt(e) {
	return typeof e == "object" && !!e && e.kind === "time_tz";
}
function Ot(e) {
	return typeof e == "object" && !!e && e.kind === "timestamp";
}
function kt(e) {
	return typeof e == "object" && !!e && e.kind === "interval";
}
//#endregion
//#region src/arrow.ts
var At = new TextEncoder(), jt = "quack:logicalType", Mt = "ARROW:extension:name", M = "__quackBigInt";
function Nt(e, t = e.columnNames, n = {}) {
	return N([e], t, n);
}
function N(e, n, r = {}) {
	let i = r.duckTypes ?? e[0]?.types ?? [], a = ln(n, e[0], i.length);
	if (a.length !== i.length) throw new t(`Arrow conversion has ${a.length} column names but ${i.length} DuckDB types`);
	let o = pn(r), s = i.map((e, t) => I(a[t] ?? `column${t}`, e)), c = s.map((n, r) => {
		let a = i[r];
		if (!a) throw new t(`Missing DuckDB type for Arrow column ${r}`);
		return new Oe(e.map((e) => {
			if (e.types.length !== i.length || e.columns.length !== i.length) throw new t("All Quack chunks converted to Arrow must have the same column count");
			let s = e.columns[r];
			if (!s) throw new t(`Chunk is missing column ${r}`);
			return L(n.type, a, s.values, o, n.metadata);
		}), n.type);
	});
	return new C({
		version: Me.V5,
		endianness: Ae.Little,
		fields: s,
		metadata: null
	}, c, r.useProxy);
}
function Pt(e, t, n = {}) {
	return P(N(e, t, n), n);
}
function P(e, n = {}) {
	let r = et(e, {
		...n.format === void 0 ? {} : { format: n.format },
		...n.codec === void 0 ? {} : { codec: n.codec }
	});
	if (!r) throw new t("Arrow IPC encoding did not return in-memory bytes");
	return r;
}
function Ft(e, t = {}) {
	return F($e(e, pn(t)), t);
}
function F(e, n = {}) {
	if (e.numCols === 0) throw new t("Cannot convert an Arrow table with no columns to Quack append chunks");
	let r = e.schema.fields, i = r.map((e, t) => Jt(e, t, n.duckTypes)), a = e.children[0]?.data.length ?? 0;
	if (a === 0) return [O(r.map((e, t) => D(i[t], [], e.name)))];
	let o = [];
	for (let n = 0; n < a; n++) {
		let a = r.map((r, a) => {
			let o = e.children[a], s = o?.data[n], c = i[a];
			if (!o || !s || !c) throw new t(`Arrow table is missing batch ${n} for column ${r.name}`);
			return D(c, Array.from({ length: s.length }, (e, t) => B(s.at(t), c, r.type)), r.name);
		});
		o.push(O(a));
	}
	return o;
}
function It(e, t = {}) {
	return e instanceof C ? F(e, t) : Ft(e, t);
}
function I(e, t) {
	let n = new Map([[jt, un(t)]]);
	return t.id === g.GEOMETRY && n.set(Mt, "geoarrow.wkb"), {
		name: e,
		type: Lt(t),
		nullable: !0,
		metadata: n
	};
}
function Lt(e) {
	switch (e.id) {
		case g.SQLNULL: return Ze();
		case g.BOOLEAN: return Fe();
		case g.TINYINT: return qe();
		case g.SMALLINT: return We();
		case g.INTEGER: return Ge();
		case g.BIGINT: return Ke();
		case g.UTINYINT: return ot();
		case g.USMALLINT: return rt();
		case g.UINTEGER: return it();
		case g.UBIGINT: return at();
		case g.HUGEINT: return Le(38, 0);
		case g.UHUGEINT: return Re(39, 0);
		case g.FLOAT: return He();
		case g.DOUBLE: return Ue();
		case g.DECIMAL: {
			let { width: t, scale: n } = H(e);
			return t <= 9 ? ze(t, n) : t <= 18 ? Be(t, n) : Le(t, n);
		}
		case g.CHAR:
		case g.VARCHAR:
		case g.ENUM:
		case g.UUID: return st();
		case g.BLOB:
		case g.BIT:
		case g.GEOMETRY: return Pe();
		case g.DATE: return Ie();
		case g.TIME: return tt();
		case g.TIME_NS: return nt();
		case g.TIME_TZ: return Ke();
		case g.TIMESTAMP_SEC: return E(w.SECOND);
		case g.TIMESTAMP_MS: return E(w.MILLISECOND);
		case g.TIMESTAMP: return E(w.MICROSECOND);
		case g.TIMESTAMP_NS: return E(w.NANOSECOND);
		case g.TIMESTAMP_TZ: return E(w.MICROSECOND, "UTC");
		case g.TIMESTAMP_TZ_NS: return E(w.NANOSECOND, "UTC");
		case g.INTERVAL: return Je(je.MONTH_DAY_NANO);
		case g.LIST: return Ye(I("item", f(e)));
		case g.MAP: {
			let n = d(f(e)), r = n.find((e) => e.name === "key") ?? n[0], i = n.find((e) => e.name === "value") ?? n[1];
			if (!r || !i) throw new t("DuckDB MAP type is missing key/value children");
			return Xe(I("key", r.type), I("value", i.type));
		}
		case g.STRUCT: return Qe(d(e).map((e) => I(e.name, e.type)));
		case g.TUPLE: return Qe(d(e).map((e, t) => I(String(t), e.type)));
		case g.ARRAY: return Ve(I("item", f(e)), S(e));
		default: throw new s(`Cannot map DuckDB logical type ${g[e.id] ?? e.id} to Arrow`);
	}
}
function L(e, t, n, r, i = null) {
	let a = n.length, { validity: o, nullCount: c } = an(n), l = Ne(e, r, i), u = {
		length: a,
		nullCount: c,
		type: e,
		validity: o
	};
	switch (e.typeId) {
		case T.Null: return new l({
			...u,
			nullCount: a
		});
		case T.Bool: return new l({
			...u,
			values: on(n)
		});
		case T.Int:
		case T.Float:
		case T.Date:
		case T.Time:
		case T.Timestamp:
		case T.Decimal:
		case T.Interval: return new l({
			...u,
			values: Rt(e, t, n)
		});
		case T.Utf8:
		case T.LargeUtf8: return new l({
			...u,
			...Ut(n, (e) => At.encode(String(e ?? "")))
		});
		case T.Binary:
		case T.LargeBinary: return new l({
			...u,
			...Ut(n, cn)
		});
		case T.List:
		case T.LargeList: return new l({
			...u,
			...Wt(e, t, n, r)
		});
		case T.Map: return new l({
			...u,
			...Gt(e, t, n, r)
		});
		case T.Struct: return new l({
			...u,
			children: Kt(e, t, n, r)
		});
		case T.FixedSizeList: return new l({
			...u,
			children: qt(e, t, n, r)
		});
		default: throw new s(`Cannot build Arrow batch for type id ${e.typeId}`);
	}
}
function Rt(e, t, n) {
	switch (e.typeId) {
		case T.Int:
		case T.Date:
		case T.Time:
		case T.Timestamp: {
			let r = e.values, i = new r(U(n.length, r.BYTES_PER_ELEMENT));
			return n.forEach((n, r) => {
				i[r] = zt(n, t, e);
			}), i;
		}
		case T.Float: {
			let t = e.values, r = new t(U(n.length, t.BYTES_PER_ELEMENT));
			return n.forEach((e, t) => {
				r[t] = Number(e ?? 0);
			}), r;
		}
		case T.Decimal: return Vt(e, t, n);
		case T.Interval: return Ht(n);
		default: throw new s(`Cannot create fixed Arrow values for type id ${e.typeId}`);
	}
}
function zt(e, t, n) {
	if (e === null) return Bt(n) ? 0n : 0;
	switch (t.id) {
		case g.DATE: return e.days;
		case g.TIME:
		case g.TIME_NS: return BigInt(e.value);
		case g.TIME_TZ: return BigInt(e.bits);
		case g.TIMESTAMP:
		case g.TIMESTAMP_SEC:
		case g.TIMESTAMP_MS:
		case g.TIMESTAMP_NS:
		case g.TIMESTAMP_TZ:
		case g.TIMESTAMP_TZ_NS: return BigInt(e.value);
		default: return typeof e == "bigint" ? e : Number(e);
	}
}
function Bt(e) {
	return "values" in e && (e.values === BigInt64Array || e.values === BigUint64Array);
}
function Vt(e, t, n) {
	let { scale: r } = H(t);
	if (e.bitWidth === 32) {
		let e = new Int32Array(U(n.length, Int32Array.BYTES_PER_ELEMENT));
		return n.forEach((n, i) => {
			e[i] = Number(sn(n, t, r));
		}), e;
	}
	let i = e.bitWidth >> 6, a = new BigUint64Array(U(n.length * i, BigUint64Array.BYTES_PER_ELEMENT));
	return n.forEach((e, n) => {
		let o = sn(e, t, r), s = n * i;
		for (let e = 0; e < i; e++) a[s + e] = o >> BigInt(e * 64);
	}), a;
}
function Ht(e) {
	let t = new Uint8Array(U(e.length * 16, Uint8Array.BYTES_PER_ELEMENT)), n = new DataView(t.buffer, t.byteOffset, t.byteLength);
	return e.forEach((e, t) => {
		let r = e, i = t * 16;
		n.setInt32(i, r?.months ?? 0, !0), n.setInt32(i + 4, r?.days ?? 0, !0), n.setBigInt64(i + 8, (r?.micros ?? 0n) * 1000n, !0);
	}), t;
}
function Ut(e, t) {
	let n = new Int32Array(U(e.length + 1, Int32Array.BYTES_PER_ELEMENT)), r = [], i = 0;
	e.forEach((e, a) => {
		if (n[a] = i, e !== null) {
			let n = t(e);
			r.push(n), i += n.byteLength;
		}
	}), n[e.length] = i;
	let a = new Uint8Array(U(i, Uint8Array.BYTES_PER_ELEMENT)), o = 0;
	for (let e of r) a.set(e, o), o += e.byteLength;
	return {
		offsets: n,
		values: a
	};
}
function Wt(e, n, r, i) {
	let a = e.children[0];
	if (!a) throw new t("Arrow LIST type is missing child metadata");
	let o = f(n), s = new Int32Array(U(r.length + 1, Int32Array.BYTES_PER_ELEMENT)), c = [];
	return r.forEach((e, t) => {
		s[t] = c.length, Array.isArray(e) && c.push(...e);
	}), s[r.length] = c.length, {
		offsets: s,
		children: [L(a.type, o, c, i, a.metadata)]
	};
}
function Gt(e, t, n, r) {
	let i = e.children[0], a = f(t), o = new Int32Array(U(n.length + 1, Int32Array.BYTES_PER_ELEMENT)), s = [];
	return n.forEach((e, t) => {
		o[t] = s.length, Array.isArray(e) && s.push(...e);
	}), o[n.length] = s.length, {
		offsets: o,
		children: [L(i.type, a, s, r, i.metadata)]
	};
}
function Kt(e, n, r, i) {
	let a = d(n), o = n.id === g.TUPLE;
	return e.children.map((e, n) => {
		let s = a[n];
		if (!s) throw new t(`STRUCT child ${n} is missing DuckDB metadata`);
		let c = r.map((e) => o && Array.isArray(e) ? e[n] ?? null : e === null || Array.isArray(e) || e instanceof Uint8Array || typeof e != "object" ? null : e[s.name] ?? null);
		return L(e.type, s.type, c, i, e.metadata);
	});
}
function qt(e, n, r, i) {
	let a = e.children[0];
	if (!a) throw new t("Arrow FixedSizeList type is missing child metadata");
	let o = f(n), s = [];
	for (let n of r) if (n === null) s.push(...Array.from({ length: e.stride }, () => null));
	else if (Array.isArray(n) && n.length === e.stride) s.push(...n);
	else throw new t(`ARRAY values must contain exactly ${e.stride} entries`);
	return [L(a.type, o, s, i, a.metadata)];
}
function Jt(e, n, r) {
	if (Yt(r)) {
		let i = r[n];
		if (!i) throw new t(`Missing DuckDB type for Arrow column ${e.name}`);
		return i;
	}
	if (r) {
		let n = r[e.name];
		if (!n) throw new t(`Missing DuckDB type for Arrow column ${e.name}`);
		return n;
	}
	return dn(e) ?? R(e.type);
}
function Yt(e) {
	return Array.isArray(e);
}
function R(e) {
	switch (e.typeId) {
		case T.Null: return x.null();
		case T.Bool: return x.boolean();
		case T.Int: return e.signed ? e.bitWidth === 8 ? x.tinyint() : e.bitWidth === 16 ? x.smallint() : e.bitWidth === 32 ? x.integer() : x.bigint() : e.bitWidth === 8 ? x.utinyint() : e.bitWidth === 16 ? x.usmallint() : e.bitWidth === 32 ? x.uinteger() : x.ubigint();
		case T.Float: return e.precision === 2 ? x.double() : x.float();
		case T.Decimal: return x.decimal(e.precision, e.scale);
		case T.Utf8:
		case T.LargeUtf8: return x.varchar();
		case T.Binary:
		case T.LargeBinary:
		case T.FixedSizeBinary: return x.blob();
		case T.Date: return x.date();
		case T.Time: return e.unit === w.NANOSECOND ? x.timeNs() : x.time();
		case T.Timestamp: return e.timezone ? e.unit === w.NANOSECOND ? x.timestampTzNanos() : x.timestampTz() : e.unit === w.SECOND ? x.timestampSeconds() : e.unit === w.MILLISECOND ? x.timestampMillis() : e.unit === w.NANOSECOND ? x.timestampNanos() : x.timestamp();
		case T.Interval: return x.interval();
		case T.List:
		case T.LargeList: return x.list(z(e.children[0]));
		case T.FixedSizeList: return x.array(z(e.children[0]), e.stride);
		case T.Struct: return x.struct(e.children.map((e) => ({
			name: e.name,
			type: z(e)
		})));
		case T.Map: {
			let t = e.children[0]?.type;
			if (!t || t.typeId !== T.Struct) throw new s("Arrow Map type is missing entries struct metadata");
			let n = t.children[0], r = t.children[1];
			if (!n || !r) throw new s("Arrow Map type is missing key/value metadata");
			return x.map(z(n), z(r));
		}
		case T.Dictionary: return R(e.dictionary);
		default: throw new s(`Cannot infer a DuckDB type from Arrow type id ${e.typeId}`);
	}
}
function z(e) {
	if (!e) throw new t("Arrow field is missing");
	return dn(e) ?? R(e.type);
}
function B(e, t, n) {
	if (e == null) return null;
	switch (t.id) {
		case g.DECIMAL: return typeof e == "bigint" ? e : String(e);
		case g.HUGEINT:
		case g.UHUGEINT: return typeof e == "bigint" ? e : BigInt(Math.trunc(Number(e)));
		case g.DATE: return e instanceof Date ? ut(e) : {
			kind: "date",
			days: Math.trunc(Number(e) / 864e5)
		};
		case g.TIME: return {
			kind: "time",
			unit: "micros",
			value: Zt(e, n, "micros")
		};
		case g.TIME_NS: return {
			kind: "time",
			unit: "nanos",
			value: Zt(e, n, "nanos")
		};
		case g.TIME_TZ: return {
			kind: "time_tz",
			bits: BigInt(e)
		};
		case g.TIMESTAMP:
		case g.TIMESTAMP_SEC:
		case g.TIMESTAMP_MS:
		case g.TIMESTAMP_NS:
		case g.TIMESTAMP_TZ:
		case g.TIMESTAMP_TZ_NS: return Xt(e, t, n);
		case g.INTERVAL: return Qt(e);
		case g.LIST: return Array.from(e, (e) => B(e, f(t), V(n)));
		case g.ARRAY: return Array.from(e, (e) => B(e, f(t), V(n)));
		case g.MAP: return $t(e, t, n);
		case g.STRUCT: return en(e, t, n);
		case g.TUPLE: return d(t).map((t, r) => B(e[String(r)], t.type, V(n, r)));
		default: return e instanceof Uint8Array, e;
	}
}
function Xt(e, t, n) {
	let r = tn(t), i = t.id === g.TIMESTAMP_TZ || t.id === g.TIMESTAMP_TZ_NS ? "utc" : void 0;
	if (e instanceof Date) return gt(e, r, i);
	let a = typeof e == "bigint" && n.typeId === T.Timestamp ? nn(e, n.unit, r) : rn(Number(e), r);
	return i === void 0 ? {
		kind: "timestamp",
		unit: r,
		value: a
	} : {
		kind: "timestamp",
		unit: r,
		value: a,
		timezone: i
	};
}
function Zt(e, t, n) {
	let r = BigInt(e);
	if (t.typeId !== T.Time) return r;
	let i = t.unit === w.SECOND ? r * 1000000n : t.unit === w.MILLISECOND ? r * 1000n : t.unit === w.NANOSECOND ? r / 1000n : r;
	return n === "nanos" ? i * 1000n : i;
}
function Qt(e) {
	let t = Array.from(e);
	return {
		kind: "interval",
		months: Number(t[0] ?? 0),
		days: Number(t[1] ?? 0),
		micros: BigInt(Math.trunc(Number(t[2] ?? 0) / 1e3))
	};
}
function $t(e, n, r) {
	let i = f(n), a = V(r);
	if (a.typeId !== T.Struct) throw new t("Arrow Map entries must be STRUCT values");
	let o = d(i), s = o[0]?.type, c = o[1]?.type, l = a.children[0]?.type, u = a.children[1]?.type;
	if (!s || !c || !l || !u) throw new t("Arrow Map entries are missing key/value metadata");
	return (e instanceof Map ? Array.from(e.entries()) : Array.from(e)).map((e) => Array.isArray(e) ? {
		key: B(e[0], s, l),
		value: B(e[1], c, u)
	} : en(e, i, a));
}
function en(e, t, n) {
	let r = d(t), i = {};
	return r.forEach((t, r) => {
		i[t.name] = B(e[t.name], t.type, V(n, r));
	}), i;
}
function V(e, n = 0) {
	if ("children" in e) {
		let r = e.children[n];
		if (!r) throw new t(`Arrow type id ${e.typeId} is missing child ${n}`);
		return r.type;
	}
	throw new t(`Arrow type id ${e.typeId} does not have children`);
}
function tn(e) {
	switch (e.id) {
		case g.TIMESTAMP_SEC: return "seconds";
		case g.TIMESTAMP_MS: return "millis";
		case g.TIMESTAMP_NS:
		case g.TIMESTAMP_TZ_NS: return "nanos";
		default: return "micros";
	}
}
function nn(e, t, n) {
	let r = t === w.SECOND ? e * 1000000000n : t === w.MILLISECOND ? e * 1000000n : t === w.MICROSECOND ? e * 1000n : e;
	switch (n) {
		case "seconds": return r / 1000000000n;
		case "millis": return r / 1000000n;
		case "micros": return r / 1000n;
		case "nanos": return r;
	}
}
function rn(e, t) {
	switch (t) {
		case "seconds": return BigInt(Math.trunc(e / 1e3));
		case "millis": return BigInt(Math.trunc(e));
		case "micros": return BigInt(Math.trunc(e * 1e3));
		case "nanos": return BigInt(Math.trunc(e * 1e6));
	}
}
function an(e) {
	let t = 0;
	for (let n of e) n === null && t++;
	if (t === 0) return {
		validity: new Uint8Array(),
		nullCount: t
	};
	let n = new Uint8Array(U(Math.ceil(e.length / 8), Uint8Array.BYTES_PER_ELEMENT));
	return e.forEach((e, t) => {
		e !== null && (n[t >> 3] = (n[t >> 3] ?? 0) | 1 << t % 8);
	}), {
		validity: n,
		nullCount: t
	};
}
function on(e) {
	let t = new Uint8Array(U(Math.ceil(e.length / 8), Uint8Array.BYTES_PER_ELEMENT));
	return e.forEach((e, n) => {
		e === !0 && (t[n >> 3] = (t[n >> 3] ?? 0) | 1 << n % 8);
	}), t;
}
function sn(e, t, n) {
	if (e === null) return 0n;
	if (typeof e == "object" && !Array.isArray(e) && !(e instanceof Uint8Array)) {
		let t = e;
		if (t.kind === "decimal") return BigInt(t.value);
	}
	if (typeof e == "bigint") return e;
	let { width: r } = H(t);
	return ct(e, r, n).value;
}
function H(e) {
	let n = e.typeInfo;
	if (n?.type !== v.DECIMAL) throw new t("DECIMAL type is missing DecimalTypeInfo");
	return {
		width: n.width,
		scale: n.scale
	};
}
function cn(e) {
	return e instanceof Uint8Array ? e : At.encode(String(e ?? ""));
}
function ln(e, t, n) {
	return e ? [...e] : t?.columnNames ? [...t.columnNames] : Array.from({ length: n }, (e, t) => `column${t}`);
}
function un(e) {
	return JSON.stringify(e, (e, t) => typeof t == "bigint" ? { [M]: t.toString() } : t);
}
function dn(e) {
	let t = e.metadata, n = t instanceof Map ? t.get(jt) : void 0;
	return n ? fn(n) : void 0;
}
function fn(e) {
	return JSON.parse(e, (e, t) => t && typeof t == "object" && M in t ? BigInt(String(t[M])) : t);
}
function pn(e) {
	return {
		...e.useDate === void 0 ? {} : { useDate: e.useDate },
		...e.useDecimalInt === void 0 ? {} : { useDecimalInt: e.useDecimalInt },
		...e.useBigInt === void 0 ? {} : { useBigInt: e.useBigInt },
		...e.useBigIntTimestamp === void 0 ? {} : { useBigIntTimestamp: e.useBigIntTimestamp },
		...e.useMap === void 0 ? {} : { useMap: e.useMap },
		...e.useProxy === void 0 ? {} : { useProxy: e.useProxy },
		...e.useGeoJSON === void 0 ? {} : { useGeoJSON: e.useGeoJSON }
	};
}
function U(e, t) {
	return (e * t + 7 & -8) / t;
}
//#endregion
//#region src/json.ts
function W(e, t = {}) {
	if (e === null || typeof e == "boolean" || typeof e == "number" || typeof e == "string") return e;
	if (typeof e == "bigint") return gn(e, t);
	if (e instanceof Uint8Array) return _n(e, t);
	if (Array.isArray(e)) return e.map((e) => W(e, t));
	if (Cn(e)) return t.decimal === "tagged" ? {
		kind: "decimal",
		value: e.value.toString(),
		width: e.width,
		scale: e.scale
	} : _(e);
	if (wn(e)) return t.date === "tagged" ? {
		kind: "date",
		days: e.days
	} : vn(e);
	if (Tn(e)) return t.time === "tagged" ? {
		kind: "time",
		unit: e.unit,
		value: e.value.toString()
	} : yn(e);
	if (En(e)) return {
		kind: "time_tz",
		bits: e.bits.toString()
	};
	if (Dn(e)) return t.timestamp === "tagged" ? {
		kind: "timestamp",
		unit: e.unit,
		value: e.value.toString(),
		...e.timezone === void 0 ? {} : { timezone: e.timezone }
	} : bn(e);
	if (On(e)) return {
		kind: "interval",
		months: e.months,
		days: e.days,
		micros: e.micros.toString()
	};
	let n = {};
	for (let [r, i] of Object.entries(e)) n[r] = W(i, t);
	return n;
}
function mn(e, t = {}) {
	return W(e, t);
}
function hn(e, t = {}) {
	return e.map((e) => mn(e, t));
}
function gn(e, n) {
	if (n.bigint !== "number") return e.toString();
	if (e > BigInt(2 ** 53 - 1) || e < BigInt(-(2 ** 53 - 1))) throw new t(`bigint value ${e.toString()} exceeds JavaScript safe integer range`);
	return Number(e);
}
function _n(e, n) {
	switch (n.bytes ?? "base64") {
		case "array": return [...e];
		case "hex": return [...e].map((e) => e.toString(16).padStart(2, "0")).join("");
		case "base64": return Sn(e);
		default: throw new t(`Unhandled JSON bytes conversion option ${String(n.bytes)}`);
	}
}
function vn(e) {
	return (/* @__PURE__ */ new Date(e.days * 864e5)).toISOString().slice(0, 10);
}
function yn(e) {
	let t = e.unit === "nanos" ? e.value : e.value * 1000n, n = xn(t, 1000000000n), r = t - n * 1000000000n, i = n / 3600n, a = n % 3600n / 60n, o = n % 60n, s = r === 0n ? "" : `.${r.toString().padStart(9, "0").replace(/0+$/, "")}`;
	return `${i.toString().padStart(2, "0")}:${a.toString().padStart(2, "0")}:${o.toString().padStart(2, "0")}${s}`;
}
function bn(e) {
	let n = e.unit === "seconds" ? e.value * 1000000000n : e.unit === "millis" ? e.value * 1000000n : e.unit === "micros" ? e.value * 1000n : e.value, r = xn(n, 1000000000n), i = n - r * 1000000000n, a = r * 1000n;
	if (a > BigInt(2 ** 53 - 1) || a < BigInt(-(2 ** 53 - 1))) throw new t(`timestamp value ${e.value.toString()} is outside JavaScript Date range`);
	return `${new Date(Number(a)).toISOString().replace(".000Z", "")}${i === 0n ? "" : `.${i.toString().padStart(9, "0").replace(/0+$/, "")}`}Z`;
}
function xn(e, t) {
	let n = e / t;
	return e % t < 0n ? n - 1n : n;
}
function Sn(e) {
	let t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", n = "";
	for (let r = 0; r < e.length; r += 3) {
		let i = e[r] ?? 0, a = e[r + 1] ?? 0, o = e[r + 2] ?? 0, s = i << 16 | a << 8 | o;
		n += t[s >> 18 & 63], n += t[s >> 12 & 63], n += r + 1 < e.length ? t[s >> 6 & 63] : "=", n += r + 2 < e.length ? t[s & 63] : "=";
	}
	return n;
}
function Cn(e) {
	return e.kind === "decimal";
}
function wn(e) {
	return e.kind === "date";
}
function Tn(e) {
	return e.kind === "time";
}
function En(e) {
	return e.kind === "time_tz";
}
function Dn(e) {
	return e.kind === "timestamp";
}
function On(e) {
	return e.kind === "interval";
}
//#endregion
//#region src/sql.ts
function G(e, t) {
	return t === void 0 ? e : In(t) ? kn(e, t) : An(e, t);
}
function K(e) {
	if (e === void 0) throw TypeError("SQL parameter value is undefined; use null for SQL NULL");
	if (e === null) return "NULL";
	if (Array.isArray(e)) return `[${e.map((e) => K(e)).join(", ")}]`;
	if (typeof e == "boolean") return e ? "TRUE" : "FALSE";
	if (typeof e == "number") {
		if (!Number.isFinite(e)) throw TypeError(`Cannot encode non-finite SQL number ${e}`);
		return String(e);
	}
	if (typeof e == "bigint") return e.toString();
	if (typeof e == "string") return `'${e.replaceAll("'", "''")}'`;
	if (e instanceof Uint8Array) return `from_hex('${Ln(e)}')`;
	if (e instanceof Date) return `TIMESTAMP '${Bn(e, "millis")}'`;
	if (Hn(e)) return _(e);
	if (Un(e)) return `DATE '${Rn(e.days)}'`;
	if (Wn(e)) return `TIME '${Vn(e.value, e.unit)}'`;
	if (Gn(e)) throw TypeError("TIME WITH TIME ZONE parameters are not supported as SQL literals");
	if (Kn(e)) return `${e.timezone === "utc" ? "TIMESTAMPTZ" : "TIMESTAMP"} '${zn(e)}'`;
	if (qn(e)) return `INTERVAL '${e.months} months ${e.days} days ${e.micros.toString()} microseconds'`;
	if (typeof e == "object") throw TypeError("Object SQL parameters are not supported; pass scalar values or arrays");
	return String(e);
}
function q(e) {
	return `"${e.replaceAll("\"", "\"\"")}"`;
}
function J(e) {
	switch (e.id) {
		case g.SQLNULL: return "\"NULL\"";
		case g.BOOLEAN:
		case g.TINYINT:
		case g.SMALLINT:
		case g.INTEGER:
		case g.BIGINT:
		case g.UTINYINT:
		case g.USMALLINT:
		case g.UINTEGER:
		case g.UBIGINT:
		case g.HUGEINT:
		case g.UHUGEINT:
		case g.FLOAT:
		case g.DOUBLE:
		case g.VARCHAR:
		case g.BLOB:
		case g.BIT:
		case g.BIGNUM:
		case g.UUID:
		case g.DATE:
		case g.TIME:
		case g.TIME_NS:
		case g.TIMESTAMP:
		case g.TIMESTAMP_MS:
		case g.TIMESTAMP_NS:
		case g.INTERVAL:
		case g.VARIANT: return g[e.id];
		case g.CHAR: return "VARCHAR";
		case g.TIMESTAMP_SEC: return "TIMESTAMP_S";
		case g.TIMESTAMP_TZ: return "TIMESTAMP WITH TIME ZONE";
		case g.TIMESTAMP_TZ_NS: return "TIMESTAMPTZ_NS";
		case g.TIME_TZ: return "TIME WITH TIME ZONE";
		case g.DECIMAL: {
			let t = e.typeInfo;
			return t?.type === v.DECIMAL ? `DECIMAL(${t.width},${t.scale})` : "DECIMAL";
		}
		case g.ENUM: return `ENUM(${i(e).map((e) => K(e)).join(", ")})`;
		case g.LIST: return `${J(f(e))}[]`;
		case g.ARRAY: return `${J(f(e))}[${S(e)}]`;
		case g.MAP: {
			let [t, n] = d(f(e));
			if (!t || !n) throw new s("MAP type is missing key/value children");
			return `MAP(${J(t.type)}, ${J(n.type)})`;
		}
		case g.STRUCT: return `STRUCT(${d(e).map((e) => `${q(e.name)} ${J(e.type)}`).join(", ")})`;
		case g.TUPLE: return `TUPLE(${d(e).map((e) => J(e.type)).join(", ")})`;
		case g.GEOMETRY: {
			let t = e.typeInfo?.type === v.GEO ? e.typeInfo.crs?.definition : void 0;
			return t ? `GEOMETRY(${K(t)})` : "GEOMETRY";
		}
		default: throw new s(`Cannot render DuckDB logical type ${g[e.id] ?? e.id} as SQL`);
	}
}
function kn(e, t) {
	let n = 0, r = jn(e, (e) => {
		if (e !== "?") return e;
		let r = t[n];
		if (n >= t.length) throw Error("SQL has more positional placeholders than parameters");
		return n++, K(r);
	});
	if (n !== t.length) throw Error(`SQL has ${n} positional placeholders but ${t.length} parameters were provided`);
	return r;
}
function An(e, t) {
	return jn(e, (e) => {
		if (!e.startsWith(":")) return e;
		let n = e.slice(1);
		if (!(n in t)) throw Error(`Missing SQL parameter :${n}`);
		return K(t[n]);
	});
}
function jn(e, t) {
	let n = "", r = 0;
	for (; r < e.length;) {
		let i = e[r], a = e[r + 1];
		if (i === "'") {
			let { text: t, end: i } = Mn(e, r);
			n += t, r = i;
			continue;
		}
		if (i === "\"") {
			let { text: t, end: i } = Nn(e, r);
			n += t, r = i;
			continue;
		}
		if (i === "-" && a === "-") {
			let t = e.indexOf("\n", r + 2), i = t < 0 ? e.length : t;
			n += e.slice(r, i), r = i;
			continue;
		}
		if (i === "/" && a === "*") {
			let t = e.indexOf("*/", r + 2), i = t < 0 ? e.length : t + 2;
			n += e.slice(r, i), r = i;
			continue;
		}
		if (i === "?") {
			n += t("?"), r++;
			continue;
		}
		if (i === ":" && e[r - 1] !== ":" && a !== ":" && Pn(a ?? "")) {
			let i = r + 1, a = i + 1;
			for (; a < e.length && Fn(e[a] ?? "");) a++;
			n += t(`:${e.slice(i, a)}`), r = a;
			continue;
		}
		n += i, r++;
	}
	return n;
}
function Mn(e, t) {
	let n = t + 1;
	for (; n < e.length;) {
		if (e[n] === "'" && e[n + 1] === "'") {
			n += 2;
			continue;
		}
		if (e[n] === "'") {
			n++;
			break;
		}
		n++;
	}
	return {
		text: e.slice(t, n),
		end: n
	};
}
function Nn(e, t) {
	let n = t + 1;
	for (; n < e.length;) {
		if (e[n] === "\"" && e[n + 1] === "\"") {
			n += 2;
			continue;
		}
		if (e[n] === "\"") {
			n++;
			break;
		}
		n++;
	}
	return {
		text: e.slice(t, n),
		end: n
	};
}
function Pn(e) {
	return /^[A-Za-z_]$/.test(e);
}
function Fn(e) {
	return /^[A-Za-z0-9_]$/.test(e);
}
function In(e) {
	return Array.isArray(e);
}
function Ln(e) {
	return [...e].map((e) => e.toString(16).padStart(2, "0")).join("");
}
function Rn(e) {
	return (/* @__PURE__ */ new Date(e * 864e5)).toISOString().slice(0, 10);
}
function zn(e) {
	let t = e.unit === "seconds" ? e.value * 1000000n : e.unit === "millis" ? e.value * 1000n : e.unit === "nanos" ? e.value / 1000n : e.value;
	return `${new Date(Number(t / 1000n)).toISOString().replace("T", " ").replace("Z", "")}${e.timezone === "utc" ? "+00" : ""}`;
}
function Bn(e, t) {
	return e.toISOString().replace("T", " ").replace("Z", "");
}
function Vn(e, t) {
	let n = t === "nanos" ? e : e * 1000n, r = n / 1000000000n, i = n % 1000000000n, a = r / 3600n, o = r % 3600n / 60n, s = r % 60n, c = i === 0n ? "" : `.${i.toString().padStart(9, "0").replace(/0+$/, "")}`;
	return `${a.toString().padStart(2, "0")}:${o.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}${c}`;
}
function Hn(e) {
	return e.kind === "decimal";
}
function Un(e) {
	return e.kind === "date";
}
function Wn(e) {
	return e.kind === "time";
}
function Gn(e) {
	return e.kind === "time_tz";
}
function Kn(e) {
	return e.kind === "timestamp";
}
function qn(e) {
	return e.kind === "interval";
}
//#endregion
//#region src/client.ts
var Jn = h * 16, Y = 5e3, Yn = class e {
	baseUrl;
	fetchImpl;
	info;
	headers;
	heartbeatEnabled;
	acknowledgeResults;
	connectionId;
	closed = !1;
	invalidatedReason;
	nextQueryId = 1n;
	heartbeatTimeoutSeconds = 60;
	heartbeatTimer;
	lastRequestAt = 0;
	statementTail = Promise.resolve();
	statementGeneration = 0;
	activeStatement;
	constructor(e, n = {}) {
		if (this.baseUrl = e.replace(/\/$/, ""), this.fetchImpl = n.fetch ?? globalThis.fetch, this.headers = n.headers, this.heartbeatEnabled = n.heartbeat ?? !0, this.acknowledgeResults = n.acknowledgeResults ?? !1, !this.fetchImpl) throw new t("No fetch implementation is available");
	}
	static async connect(n, r = {}) {
		let i = Xn(n, r.ssl), a = tr(r.heartbeatTimeoutSeconds ?? 60);
		if (r.clientId !== void 0 && r.clientId !== "" && r.clientId.length < 4) throw new t("clientId must be at least 4 characters long");
		let o = new e(i.baseUrl, r), s = {
			type: b.CONNECTION_REQUEST,
			clientPlatform: r.clientPlatform ?? er(),
			minSupportedQuackVersion: r.minSupportedQuackVersion ?? 3,
			maxSupportedQuackVersion: r.maxSupportedQuackVersion ?? 3,
			heartbeatTimeoutSeconds: a
		};
		r.authToken !== void 0 && (s.authString = r.authToken), r.clientDuckdbVersion !== void 0 && (s.clientDuckdbVersion = r.clientDuckdbVersion), r.clientId !== void 0 && (s.clientId = r.clientId);
		let c = await o.send(s, r);
		if (c.type !== b.CONNECTION_RESPONSE) throw new t(`Expected CONNECTION_RESPONSE, got ${b[c.type] ?? c.type}`);
		if (!c.connectionId) throw new t("CONNECTION_RESPONSE did not include a connection id");
		if (o.connectionId = c.connectionId, c.quackVersion !== BigInt(3)) throw await o.disconnect().catch(() => void 0), new t(`Incompatible Quack protocol version: server uses ${c.quackVersion ?? "unknown"}, client supports 3`);
		return c.heartbeatTimeoutSeconds !== void 0 && c.heartbeatTimeoutSeconds > 0n ? o.heartbeatTimeoutSeconds = tr(c.heartbeatTimeoutSeconds) : o.heartbeatTimeoutSeconds = a, o.info = {
			...c.serverDuckdbVersion === void 0 ? {} : { serverDuckdbVersion: c.serverDuckdbVersion },
			...c.serverPlatform === void 0 ? {} : { serverPlatform: c.serverPlatform },
			...c.quackVersion === void 0 ? {} : { quackVersion: c.quackVersion },
			heartbeatTimeoutSeconds: o.heartbeatTimeoutSeconds
		}, o.scheduleHeartbeat(), o;
	}
	static async withConnection(n, r, i) {
		let a = typeof r == "function" ? {} : r, o = typeof r == "function" ? r : i;
		if (!o) throw new t("withConnection requires a callback");
		let s = await e.connect(n, a);
		try {
			return await o(s);
		} finally {
			await s.disconnect();
		}
	}
	get isConnected() {
		return !!this.connectionId && !this.closed && this.invalidatedReason === void 0;
	}
	async query(e, t, n) {
		let r = Q(t, n), i = G(e, r.params), { prepare: a, chunks: o } = await this.withStatement(async (e) => {
			let t = await this.prepare(i, e, r), n = Z(t.results, t.resultNames);
			if (t.needsMoreFetch) for (let i = 1;; i++) {
				let a = await this.fetchBatch(e, i, r);
				if (a.results.length === 0) break;
				n.push(...Z(a.results, t.resultNames));
			}
			return await this.acknowledge(e), {
				prepare: t,
				chunks: n
			};
		});
		return {
			names: a.resultNames,
			types: a.resultTypes,
			chunks: o,
			rows: () => y(o, a.resultNames),
			jsonRows: (e = {}) => hn(y(o, a.resultNames), e)
		};
	}
	async queryArrow(e, t, n) {
		let r = $(t, n), i = await this.query(e, r);
		return N(i.chunks, i.names, {
			...r,
			duckTypes: i.types
		});
	}
	async queryArrowIPC(e, t, n) {
		let r = $(t, n);
		return P(await this.queryArrow(e, r), r);
	}
	async first(e, t, n) {
		return (await this.query(e, Q(t, n))).rows()[0] ?? null;
	}
	async one(e, n, r) {
		let i = (await this.query(e, Q(n, r))).rows();
		if (i.length !== 1) throw new t(`Expected exactly one row, got ${i.length}`);
		return i[0];
	}
	async values(e, t, n) {
		let r = await this.query(e, Q(t, n)), i = r.names[0];
		return i ? r.rows().map((e) => e[i]) : [];
	}
	async *stream(e, n, r) {
		let i = Q(n, r), a = G(e, i.params), o, s = await this.withStatement(async (e) => (o = e, this.prepare(a, e, i)), { keepActive: !0 }), c = o, l = !s.needsMoreFetch;
		try {
			for (let e of Z(s.results, s.resultNames)) yield e;
			for (let e = 1; !l; e++) {
				let n = await this.withStatementSlot(async () => {
					if (this.statementGeneration !== c.generation) throw new t("Stream was interrupted by another statement on the same Quack client");
					return this.fetchBatch(c, e, i);
				});
				if (n.results.length === 0) {
					l = !0;
					break;
				}
				for (let e of Z(n.results, s.resultNames)) yield e;
			}
			await this.acknowledge(c);
		} finally {
			!l && this.statementGeneration === c.generation && await this.cancelQuietly(c), this.endStatement(c);
		}
	}
	async *streamRows(e, t, n) {
		for await (let r of this.stream(e, Q(t, n))) for (let e of y([r])) yield e;
	}
	async *streamArrow(e, t, n) {
		let r = $(t, n);
		for await (let t of this.stream(e, r)) yield Nt(t, t.columnNames, r);
	}
	async append(e, n, r) {
		this.ensureOpen();
		let { target: i, options: a } = dr(e, r), o = nr(n) ? n : [n], s = o[0]?.types;
		if (!s || s.length === 0) throw new t("append requires at least one chunk with at least one column");
		for (let e of o) if (e.types.length !== s.length || e.types.some((e, t) => e.id !== s[t]?.id)) throw new t("All append chunks must have the same column types");
		let c = rr(o), l = sr(), u = `NULL::STRUCT(${s.map((e, t) => `col${t} ${J(e)}`).join(", ")})`, ee = `INSERT INTO ${i} SELECT * FROM scan_data_from_quack_client(${K(l)}, ${u}, ordered := true)`;
		return this.withStatement(async (e) => {
			await this.prepare(ee, e, {
				...a,
				inlineRows: 0
			});
			for (let e = 0; e < c.length; e++) await this.sendData({
				type: b.SEND_DATA_REQUEST,
				connectionId: this.getConnectionId(),
				clientQueryId: this.allocateQueryId(),
				streamId: l,
				chunks: c[e],
				batchIndex: e + 1
			}, a);
			await this.sendData({
				type: b.SEND_DATA_REQUEST,
				connectionId: this.getConnectionId(),
				clientQueryId: this.allocateQueryId(),
				streamId: l,
				chunks: [],
				totalBatches: c.length
			}, a);
			let t = (await this.fetchBatch(e, 1, a)).results[0]?.columns[0]?.values[0];
			return t == null ? 0 : Number(t);
		}, { cancelOnServerError: !0 });
	}
	async appendRows(e, n, r = {}) {
		let i = r.columns === void 0 ? {} : { columns: r.columns };
		if (n.length === 0) return this.append(e, k(n, i), r);
		let a = r.batchSize ?? n.length;
		if (a < 1) throw new t("appendRows batchSize must be at least 1");
		let o = [];
		for (let e = 0; e < n.length; e += a) o.push(k(n.slice(e, e + a), i));
		return this.append(e, o, r);
	}
	async appendArrow(e, t, n = {}) {
		return this.append(e, It(t, n), n);
	}
	async transaction(e, t = {}) {
		await this.query("BEGIN TRANSACTION", t);
		try {
			let n = await e(this);
			return await this.query("COMMIT", t), n;
		} catch (e) {
			try {
				await this.query("ROLLBACK", t);
			} catch {}
			throw e;
		}
	}
	async cancel(e = {}) {
		let t = this.activeStatement;
		return !t || !this.isConnected ? !1 : (X(await this.send({
			type: b.CANCEL_REQUEST,
			connectionId: this.getConnectionId(),
			clientQueryId: this.allocateQueryId(),
			queryUuid: t.queryUuid
		}, e), b.SUCCESS_RESPONSE), !0);
	}
	async heartbeat(e = {}) {
		this.ensureOpen(), X(await this.send({
			type: b.HEARTBEAT_REQUEST,
			connectionId: this.getConnectionId(),
			clientQueryId: this.allocateQueryId()
		}, e), b.SUCCESS_RESPONSE);
	}
	async disconnect(e = {}) {
		this.stopHeartbeat();
		let t = this.connectionId;
		if (this.closed || !t) {
			this.closed = !0;
			return;
		}
		this.closed = !0, this.connectionId = void 0, this.invalidatedReason === void 0 && X(await this.send({
			type: b.DISCONNECT_MESSAGE,
			connectionId: t,
			clientQueryId: this.allocateQueryId()
		}, e), b.SUCCESS_RESPONSE);
	}
	async close(e = {}) {
		await this.disconnect(e);
	}
	async send(e, n = {}) {
		let r = le(e), i = new ArrayBuffer(r.byteLength);
		new Uint8Array(i).set(r);
		let { signal: a, cleanup: s } = fr(n), c, l;
		this.lastRequestAt = Date.now();
		try {
			let e = {
				method: "POST",
				headers: {
					Accept: o,
					"Content-Type": o,
					...this.headers
				},
				body: i
			};
			if (a !== void 0 && (e.signal = a), c = await this.fetchImpl(`${this.baseUrl}${ce}`, e), !c.ok) throw new t(`Quack HTTP request failed with ${c.status} ${c.statusText}`);
			l = new Uint8Array(await c.arrayBuffer());
		} finally {
			s();
		}
		let u = Ce(l);
		if (u.type === b.ERROR_RESPONSE) throw u.mustInvalidate && (this.invalidatedReason = u.message, this.stopHeartbeat()), new p(u.message, {
			...u.exceptionType === void 0 ? {} : { exceptionType: u.exceptionType },
			...u.extraInfo === void 0 ? {} : { extraInfo: u.extraInfo },
			...u.mustInvalidate === void 0 ? {} : { mustInvalidate: u.mustInvalidate }
		});
		return u;
	}
	async prepare(e, t, n = {}) {
		return X(await this.send({
			type: b.PREPARE_REQUEST,
			connectionId: this.getConnectionId(),
			clientQueryId: this.allocateQueryId(),
			sql: e,
			queryUuid: t.queryUuid,
			...n.inlineRows === void 0 ? {} : { inlineRows: n.inlineRows }
		}, n), b.PREPARE_RESPONSE);
	}
	async fetchBatch(e, n, r = {}) {
		let i = X(await this.send({
			type: b.FETCH_REQUEST,
			connectionId: this.getConnectionId(),
			clientQueryId: this.allocateQueryId(),
			queryUuid: e.queryUuid,
			batchIndex: n,
			ackIndex: n - 1
		}, r), b.FETCH_RESPONSE);
		if (i.results.length === 0) {
			let e = BigInt(n - 1);
			if (i.totalBatches !== void 0 && i.totalBatches !== e) throw new t(`Result ended after ${e} batches but the server announced ${i.totalBatches}`);
		} else if (i.batchIndex !== BigInt(n)) throw new t(`FETCH_RESPONSE carries batch ${i.batchIndex ?? "none"} but batch ${n} was requested`);
		return i;
	}
	async sendData(e, t) {
		X(await this.send(e, t), b.SEND_DATA_RESPONSE);
	}
	async acknowledge(e) {
		if (!(!this.acknowledgeResults || !this.isConnected)) try {
			await this.send({
				type: b.ACKNOWLEDGEMENT,
				connectionId: this.getConnectionId(),
				clientQueryId: this.allocateQueryId(),
				queryUuid: e.queryUuid
			}, { timeoutMs: Y });
		} catch {}
	}
	async cancelQuietly(e) {
		if (this.isConnected) try {
			await this.send({
				type: b.CANCEL_REQUEST,
				connectionId: this.getConnectionId(),
				clientQueryId: this.allocateQueryId(),
				queryUuid: e.queryUuid
			}, { timeoutMs: Y });
		} catch {}
	}
	async withStatement(e, { keepActive: t = !1, cancelOnServerError: n = !1 } = {}) {
		return this.withStatementSlot(async () => {
			this.ensureOpen();
			let r = this.beginStatement(), i = !1;
			try {
				let t = await e(r);
				return i = !0, t;
			} catch (e) {
				throw (n || !(e instanceof p)) && await this.cancelQuietly(r), e;
			} finally {
				(!i || !t) && this.endStatement(r);
			}
		});
	}
	async withStatementSlot(e) {
		let t, n = new Promise((e) => {
			t = e;
		}), r = this.statementTail;
		this.statementTail = r.then(() => n), await r;
		try {
			return await e();
		} finally {
			t();
		}
	}
	beginStatement() {
		let e = {
			generation: ++this.statementGeneration,
			queryUuid: or()
		};
		return this.activeStatement = e, e;
	}
	endStatement(e) {
		this.activeStatement === e && (this.activeStatement = void 0);
	}
	scheduleHeartbeat() {
		if (!this.heartbeatEnabled || !this.isConnected) return;
		let e = this.heartbeatTimeoutSeconds * 1e3 / 3, t = Math.min(e * (.8 + Math.random() * .4), 2147483647), n = setTimeout(() => {
			this.heartbeatTimer = void 0, this.heartbeatTick(e);
		}, t);
		cr(n), this.heartbeatTimer = n;
	}
	async heartbeatTick(e) {
		if (this.isConnected) {
			if (Date.now() - this.lastRequestAt >= e / 2) try {
				await this.heartbeat({ timeoutMs: Y });
			} catch {}
			this.scheduleHeartbeat();
		}
	}
	stopHeartbeat() {
		this.heartbeatTimer !== void 0 && (clearTimeout(this.heartbeatTimer), this.heartbeatTimer = void 0);
	}
	ensureOpen() {
		if (this.invalidatedReason !== void 0) throw new t(`The Quack server invalidated its database and must be restarted: ${this.invalidatedReason}`);
		if (this.closed || !this.connectionId) throw new t("Quack client is not connected");
	}
	getConnectionId() {
		return this.ensureOpen(), this.connectionId;
	}
	allocateQueryId() {
		return this.nextQueryId++;
	}
};
function Xn(e, n) {
	let r = e.trim();
	if (!r) throw new t("Quack URI is empty");
	if (r.startsWith("http://") || r.startsWith("https://")) {
		let e = new URL(r), t = e.protocol === "https:";
		return {
			baseUrl: `${e.protocol}//${e.host}`,
			host: e.hostname,
			port: e.port ? Number(e.port) : t ? 443 : 80,
			ssl: t
		};
	}
	let i = r;
	if (i.startsWith("quack://") ? i = i.slice(8) : i.startsWith("quack:") && (i = i.slice(6)), !i) throw new t(`Invalid Quack URI ${e}`);
	let { host: a, port: o } = Qn(i), s = n ?? !Zn(a);
	return {
		baseUrl: `${s ? "https" : "http"}://${a.includes(":") && !a.startsWith("[") ? `[${a}]` : a}:${o}`,
		host: a,
		port: o,
		ssl: s
	};
}
function Zn(e) {
	return e.toLowerCase() === "localhost" || e === "127.0.0.1" || e === "::1";
}
function Qn(e) {
	if (e.startsWith("[")) {
		let n = e.indexOf("]");
		if (n < 0) throw new t(`Invalid IPv6 Quack URI host ${e}`);
		let r = e.slice(1, n), i = e.slice(n + 1);
		return {
			host: r,
			port: i.startsWith(":") ? $n(i.slice(1)) : m
		};
	}
	let n = [...e].filter((e) => e === ":").length;
	if (n === 0) return {
		host: e,
		port: m
	};
	if (n === 1) {
		let [n, r] = e.split(":");
		if (!n) throw new t(`Invalid Quack URI host ${e}`);
		return {
			host: n,
			port: $n(r ?? "")
		};
	}
	throw new t(`IPv6 Quack URI hosts must be enclosed in []: ${e}`);
}
function $n(e) {
	let n = Number(e);
	if (!Number.isInteger(n) || n < 1 || n > 65535) throw new t(`Invalid Quack URI port ${e}`);
	return n;
}
function er() {
	return globalThis.navigator?.userAgent ?? "quack-ts";
}
function tr(e) {
	let n = BigInt(e);
	if (typeof e == "number" && !Number.isInteger(e)) throw new t("heartbeatTimeoutSeconds must be an integer");
	if (n < 1n || n > Se || n > BigInt(2 ** 53 - 1)) throw new t(`heartbeatTimeoutSeconds must be between 1 and ${2 ** 53 - 1}`);
	return Number(n);
}
function X(e, n) {
	if (e.type !== n) throw new t(`Expected ${b[n]}, got ${b[e.type] ?? e.type}`);
	return e;
}
function Z(e, t) {
	return e.map((e) => ({
		...e,
		columnNames: [...t]
	}));
}
function nr(e) {
	return Array.isArray(e);
}
function rr(e) {
	let t = [], n = [], r = 0;
	for (let i of e) for (let e = 0; e < i.rowCount; e += h) {
		let a = ir(i, e, Math.min(i.rowCount, e + h));
		r + a.rowCount > Jn && n.length > 0 && (t.push(n), n = [], r = 0), n.push(a), r += a.rowCount;
	}
	return n.length > 0 && t.push(n), t;
}
function ir(e, t, n) {
	return t === 0 && n === e.rowCount ? e : {
		...e,
		rowCount: n - t,
		columns: e.columns.map((e) => ({
			...e,
			values: e.values.slice(t, n)
		}))
	};
}
function ar(e) {
	let t = new Uint8Array(e), n = globalThis.crypto;
	if (n?.getRandomValues) n.getRandomValues(t);
	else for (let n = 0; n < e; n++) t[n] = Math.floor(Math.random() * 256);
	return t;
}
function or() {
	for (;;) {
		let e = new DataView(ar(16).buffer), t = e.getBigInt64(0, !0), n = e.getBigUint64(8, !0);
		if (t !== 0n || n !== 0n) return {
			upper: t,
			lower: n
		};
	}
}
function sr() {
	return [...ar(16)].map((e) => e.toString(16).padStart(2, "0")).join("");
}
function cr(e) {
	let t = e;
	typeof t == "object" && typeof t.unref == "function" && t.unref();
}
function Q(e, t) {
	return e === void 0 ? t ? { ...t } : {} : Array.isArray(e) ? {
		...t,
		params: e
	} : ur(e) ? {
		...e,
		...t
	} : {
		...t,
		params: e
	};
}
function $(e, t) {
	if (e === void 0) return t ? {
		...t,
		params: t.params
	} : { params: void 0 };
	if (Array.isArray(e)) return {
		...t,
		params: e
	};
	if (lr(e)) {
		let n = {
			...e,
			...t
		};
		return {
			...n,
			params: n.params
		};
	}
	return {
		...t,
		params: e
	};
}
function lr(e) {
	return ur(e) || "useDate" in e || "useDecimalInt" in e || "useBigInt" in e || "useBigIntTimestamp" in e || "useMap" in e || "useProxy" in e || "useGeoJSON" in e || "duckTypes" in e || "format" in e || "codec" in e;
}
function ur(e) {
	return "params" in e || "signal" in e || "timeoutMs" in e || "inlineRows" in e;
}
function dr(e, n) {
	let r = typeof e == "string" ? { table: e } : e, i = typeof n == "string" ? {} : n ?? {}, a = typeof n == "string" ? n : i.schema ?? r.schema;
	if (!r.table) throw new t("append requires a table name");
	return {
		target: [
			...r.catalog === void 0 ? [] : [r.catalog],
			...a === void 0 ? [] : [a],
			r.table
		].map(q).join("."),
		options: {
			...i.signal === void 0 ? {} : { signal: i.signal },
			...i.timeoutMs === void 0 ? {} : { timeoutMs: i.timeoutMs }
		}
	};
}
function fr(e) {
	if (e.timeoutMs === void 0) return {
		...e.signal === void 0 ? {} : { signal: e.signal },
		cleanup: () => void 0
	};
	if (e.timeoutMs < 1) throw new t("timeoutMs must be at least 1");
	let n = new AbortController(), r = () => n.abort(e.signal?.reason), i = setTimeout(() => n.abort(/* @__PURE__ */ Error(`Quack request timed out after ${e.timeoutMs}ms`)), e.timeoutMs);
	return e.signal && (e.signal.aborted ? n.abort(e.signal.reason) : e.signal.addEventListener("abort", r, { once: !0 })), {
		signal: n.signal,
		cleanup: () => {
			clearTimeout(i), e.signal?.removeEventListener("abort", r);
		}
	};
}
//#endregion
export { C as ArrowTable, te as BinaryReader, ne as BinaryWriter, ke as CompressionType, oe as DEFAULT_HEARTBEAT_TIMEOUT_SECONDS, m as DEFAULT_QUACK_PORT, o as DUCKDB_MIME_TYPE, v as ExtraTypeInfoType, u as FIELD_END, g as LogicalTypeId, x as LogicalTypes, Se as MAX_HEARTBEAT_TIMEOUT_SECONDS, b as MessageType, l as OPTIONAL_INDEX_INVALID, Ee as PhysicalType, ce as QUACK_ENDPOINT, se as QUACK_VERSION, Yn as QuackClient, De as QuackError, t as QuackProtocolError, p as QuackServerError, s as QuackUnsupportedTypeError, h as STANDARD_VECTOR_SIZE, be as VectorType, Pt as arrowIPCFromChunks, P as arrowIPCFromTable, N as arrowTableFromChunks, Nt as arrowTableFromDataChunk, re as bigIntToSafeNumber, y as chunksToRows, D as column, a as combineSignedHugeInt, c as combineUnsignedHugeInt, ee as concatBytes, O as dataChunk, k as dataChunkFromRows, It as dataChunksFromArrow, Ft as dataChunksFromArrowIPC, F as dataChunksFromArrowTable, dt as dateFromISODate, ut as dateFromJSDate, lt as dateValue, ft as dateValueToJSDate, _ as decimalToString, ct as decimalValue, _e as decodeDataChunk, we as decodeDataChunkWrapper, ue as decodeExtraTypeInfo, ye as decodeHeader, Te as decodeLogicalType, Ce as decodeMessage, de as decodeVector, fe as encodeDataChunk, xe as encodeDataChunkWrapper, ae as encodeExtraTypeInfo, me as encodeHeader, n as encodeLogicalType, le as encodeMessage, ve as encodeVector, G as formatSql, S as getArraySize, f as getChildType, i as getEnumValues, r as getPhysicalType, d as getStructChildren, vt as intervalValue, ge as isConstantSizePhysicalType, e as logicalType, J as logicalTypeToSql, Xn as parseQuackUri, he as physicalTypeSize, q as quoteIdentifier, pe as rowsFromChunk, ie as splitSignedHugeInt, K as sqlLiteral, mt as timeTzValue, pt as timeValue, gt as timestampFromJSDate, ht as timestampValue, _t as timestampValueToJSDate, mn as toJsonRow, hn as toJsonRows, W as toJsonValue };
