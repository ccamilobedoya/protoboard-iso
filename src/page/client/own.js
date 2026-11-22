// Lookups by a part's id (or a node's name) that no id can turn into something else. An id is any
// text the kit accepts, so "__proto__", "constructor" or "toString" are ids too: a plain object
// answers them from its prototype (a function, Object.prototype) when the part is not there.
//   ownValue(map, key)     the value only when the map has it as its own
//   parseData(text)    JSON with every object made without a prototype
//   table()            an empty map with no prototype

export const ownValue = (map, key) => (map != null && Object.hasOwn(map, key) ? map[key] : undefined);
export const table = () => Object.create(null);
// JSON.parse keeps "__proto__" as an own key; a copy into an object with no prototype keeps it so and
// leaves a missing key undefined.
const bare = (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.assign(table(), v) : v);
export const parseData = (text) => JSON.parse(text, bare);
