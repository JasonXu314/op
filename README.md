# OPerator Overloading is OP

Since TC39 refused to add native operator overloading to JS, I did it myself.

We abuse template literal syntax:

```js
import { op } from '@nano-utils/op';

// ...

const a = new Vector(1, 2),
	b = new Vector(3, 4);

console.log(op`${a} + ${b}`); // -> Vector(4, 6)
```

to create a close-to-native experience for operator overloading.

On the implementation side, it's as simple as defining a function:

```js
class Vector {
	constructor(...elems) {
		this.arr = elems;
	}

	'operator+'(other) {
		return new Vector(...this.arr.map((e, i) => e + other.arr[i]));
	}
}
```

By default, operators follow standard order of precedence (ie. `*` before `+`, etc.), but a custom `op` tag can be created using the `makeOp` function, with custom operator precedences (and additional operators):

```js
import { makeOp } from '@nano-utils/op';

const op = makeOp([
	['*', '/'],
	['+', '-'],
	['==', '!=']
]); // this is the default ordering
```

Note that higher-appearing arrays are higher-precedence, and get evaluated first:

```js
op`${a} + ${b} * ${c} == ${d}`;
```

In this example, `b * c` is evaluated, followed by `a +` the result, and finally `== d` with the result.

For "strong typing", `op` comes with a type parameter that allows you to assert the return value of the overall expression

```ts
const res = op<boolean>`${a} + ${b} == c`;

type T = typeof res; // boolean
```

Due to restrictions with TypeScript's type system in inferring template literal structure, resulting types cannot be automatically inferred.
