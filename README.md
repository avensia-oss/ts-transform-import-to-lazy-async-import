# ts-transform-import-to-lazy-async-import

_Note! This transformer is currently experimental_

A TypeScript custom transformer that turns your synchronously imported components into lazy loaded through `React.lazy()` (or a factory of your choosing). You
can either pass in a list of components to rewrite (you can use this transform to get the data:
https://github.com/avensia-oss/ts-transform-instrument-react-components) or you can choose to rewrite all components that is found.

This transformer will essentially rewrite this:

```js
import React from 'react';
import SomeComponent from './SomeComponent';

export default (props: any) => <div><SomeComponent /></div>;
```

To this:

```js
import React from 'react';
const SomeComponent = React.lazy(() => import('./SomeComponent'));

export default (props: any) => <div><SomeComponent /></div>;
```

Note that it also works with named exports and not just default exports. Meaning it will turn this:

```js
import React from 'react';
import { SomeComponent } from './SomeComponent';

export default (props: any) => <div><SomeComponent /></div>;
```

To this:

```js
import React from 'react';
const SomeComponent = React.lazy(() => import('./SomeComponent').then(m => ({default: m.SomeComponent})));

export default (props: any) => <div><SomeComponent /></div>;
```

The React team only wants to support default exports for now and you shouldn't manually write code like this. This transformer will be updated accordingly
when/if React changes how it deals with default/named exports so you don't have to care. Also note that it's possible to turn this off. See below in the options section.

## Other useful transform

If you don't want to turn all your imports into async imports you can use this transform: https://github.com/avensia-oss/ts-transform-instrument-react-components
to first get a list of components that aren't rendered on the initial render.

# Installation

```
yarn add @avensia-oss/ts-transform-import-to-lazy-async-import
```

## Options

### Other factory than `React.lazy`

It's possible to specify some other expression than `React.lazy` (since it currently doesn't support server rendering). If you want to use `@loadable` instead you can configure this transform with this options object:

```js
getCustomTransformers: (program) => ({
  before: [importToLazyAsyncImport(program, {
    createComponentWrapperExpression: ts => {
      return ts.createIdentifier('loadable');
    },
    createImportDeclaration: (ts, currentFile) => {
      return ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(ts.createIdentifier('loadable'), undefined),
        ts.createStringLiteral('@loadable/component'),
      );
    },
  })]
})
```

### Only rewriting default exports

If you want to stick to the rules you can tell this transformer to only rewrite an import if it's a default import.

```js
getCustomTransformers: (program) => ({
  before: [importToLazyAsyncImport(program, {
    onlyRewriteDefaultExports: true,
  })]
})
```

### Only rewriting if the import statement can be removed

By default this transform will rewrite all component imports, even if the same import statement imports other things as well. This might not be what you want,
since in that case the original import statement won't be fully removed and the value of lazy loading the components is very small. The reason for this default
behavior is that this transform can't know if some other tool (such as https://github.com/avensia-oss/ts-transform-export-const-folding) is able to remove the
other imports.

```js
getCustomTransformers: (program) => ({
  before: [importToLazyAsyncImport(program, {
    onlyRewriteIfImportCanBeRemoved: true,
  })]
})
```

### Dynamically determining when to rewrite

If you have a list of files you want to lazy load (like the result of https://github.com/avensia-oss/ts-transform-instrument-react-components) you can implement
it like this:

```js
import * as path from 'path';

getCustomTransformers: (program) => ({
  before: [importToLazyAsyncImport(program, {
    shouldRewrite: (importSpecifier: string, currentFile: string) => {
      const fullPath = path.join(currentFile, importSpecifier);
      return myListOfFilesToAsyncLoad.indexOf(fullPath) !== -1;
    }
  })]
})
```

## Usage with webpack

Unfortunately TypeScript doesn't let you specifiy custom transformers in `tsconfig.json`. If you're using `ts-loader` with webpack you can specify it like this:
https://github.com/TypeStrong/ts-loader#getcustomtransformers-----before-transformerfactory-after-transformerfactory--

The default export of this module is a function which expects a `ts.Program` an returns a transformer function. Your config should look something like this:

```js
const importToLazyAsyncImport = require('@avensia-oss/ts-transform-import-to-lazy-async-import');

return {
  ...
  options: {
    getCustomTransformers: (program) => ({
      before: [importToLazyAsyncImport(program, options)] // See options above
    })
  }
  ...
};
```
