import compile from './compile';

type Code = { [fileName: string]: string };

test('importing a default function component gets rewritten', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default function (props: any) {
    return <p>Hello!</p>;
}
    `,
    'component2.tsx': `
import * as React from "react";
import MyComp1 from "./component1";
export default function (props: any) {
    return <p><MyComp1 /></p>;
}
    `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default function (props) {
    return <p>Hello!</p>;
}
    `,
    'component2.jsx': `
import * as React from "react";
const MyComp1 = React.lazy(() => import("./component1"));
export default function (props) {
    return <p><MyComp1 /></p>;
}
    `,
  };

  expectEqual(expected, compile(code));
});

test('importing a default arrow function component gets rewritten', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default (props: any) => <p>Hello!</p>;
    `,
    'component2.tsx': `
import * as React from "react";
import MyComp1 from "./component1";
export default function (props: any) {
    return <p><MyComp1 /></p>;
}
    `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default (props) => <p>Hello!</p>;
    `,
    'component2.jsx': `
import * as React from "react";
const MyComp1 = React.lazy(() => import("./component1"));
export default function (props) {
    return <p><MyComp1 /></p>;
}
    `,
  };

  expectEqual(expected, compile(code));
});

test('importing a default class component gets rewritten', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default class MyComp1 extends React.Component<any> {
    render() {
        return <p>Hello!</p>;
    }
}
    `,
    'component2.tsx': `
import * as React from "react";
import MyComp1 from "./component1";
export default function (props: any) {
    return <p><MyComp1 /></p>;
}
    `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default class MyComp1 extends React.Component {
    render() {
        return <p>Hello!</p>;
    }
}
    `,
    'component2.jsx': `
import * as React from "react";
const MyComp1 = React.lazy(() => import("./component1"));
export default function (props) {
    return <p><MyComp1 /></p>;
}
    `,
  };

  expectEqual(expected, compile(code));
});

test('importing a named export function component gets rewritten', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export function MyComp1(props: any) {
    return <p>Hello!</p>;
}
      `,
    'component2.tsx': `
import * as React from "react";
import { MyComp1 } from "./component1";
export default function (props: any) {
    return <p><MyComp1 /></p>;
}
      `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export function MyComp1(props) {
    return <p>Hello!</p>;
}
      `,
    'component2.jsx': `
import * as React from "react";
const MyComp1 = React.lazy(() => import("./component1").then(m => ({ default: m.MyComp1 })));
export default function (props) {
    return <p><MyComp1 /></p>;
}
      `,
  };

  expectEqual(expected, compile(code));
});

test('importing a named export function component as aliased gets rewritten', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export function MyComp1(props: any) {
    return <p>Hello!</p>;
}
      `,
    'component2.tsx': `
import * as React from "react";
import { MyComp1 as MyAliasedComp } from "./component1";
export default function (props: any) {
    return <p><MyAliasedComp /></p>;
}
      `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export function MyComp1(props) {
    return <p>Hello!</p>;
}
      `,
    'component2.jsx': `
import * as React from "react";
const MyAliasedComp = React.lazy(() => import("./component1").then(m => ({ default: m.MyComp1 })));
export default function (props) {
    return <p><MyAliasedComp /></p>;
}
      `,
  };

  expectEqual(expected, compile(code));
});

test('importing a mix of components and other things gets rewritten correctly', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default class MyComp1 extends React.Component<any> {
    render() {
        return <p>Hello!</p>;
    }
}
export const MyComp2 = (props: any) => <div />;
export const MyConst = "123";
    `,
    'component2.tsx': `
import * as React from "react";
import MyComp1, { MyComp2, MyConst } from "./component1";
export default function (props: any) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
    `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default class MyComp1 extends React.Component {
    render() {
        return <p>Hello!</p>;
    }
}
export const MyComp2 = (props) => <div />;
export const MyConst = "123";
    `,
    'component2.jsx': `
import * as React from "react";
const MyComp1 = React.lazy(() => import("./component1"));
const MyComp2 = React.lazy(() => import("./component1").then(m => ({ default: m.MyComp2 })));
import { MyConst } from "./component1";
export default function (props) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
    `,
  };

  expectEqual(expected, compile(code));
});

test('importing another mix of components and other things gets rewritten correctly', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default "123";
export class MyComp1 extends React.Component<any> {
    render() {
        return <p>Hello!</p>;
    }
}
export const MyComp2 = (props: any) => <div />;
export const MyConst2 = "123";
      `,
    'component2.tsx': `
import * as React from "react";
import MyConst1, { MyComp1, MyComp2, MyConst2 } from "./component1";
export default function (props: any) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
      `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default "123";
export class MyComp1 extends React.Component {
    render() {
        return <p>Hello!</p>;
    }
}
export const MyComp2 = (props) => <div />;
export const MyConst2 = "123";
      `,
    'component2.jsx': `
import * as React from "react";
const MyComp1 = React.lazy(() => import("./component1").then(m => ({ default: m.MyComp1 })));
const MyComp2 = React.lazy(() => import("./component1").then(m => ({ default: m.MyComp2 })));
import MyConst1, { MyConst2 } from "./component1";
export default function (props) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
      `,
  };

  expectEqual(expected, compile(code));
});

test('can replace call to react', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default function (props: any) {
    return <p>Hello!</p>;
}
export function MyComp2(props: any) {
    return <p>Hello!</p>;
}
      `,
    'component2.tsx': `
import * as React from "react";
import MyComp1, { MyComp2 } from "./component1";
export default function (props: any) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
      `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default function (props) {
    return <p>Hello!</p>;
}
export function MyComp2(props) {
    return <p>Hello!</p>;
}
      `,
    'component2.jsx': `
import * as React from "react";
import loadable from "@loadable/component";
const MyComp1 = loadable(() => import("./component1"));
import { MyComp2 } from "./component1";
export default function (props) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
      `,
  };

  expectEqual(
    expected,
    compile(code, {
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
      onlyRewriteDefaultExports: true,
    }),
  );
});

test('bails out if it cannot remove the import', () => {
  const code = {
    'component1.tsx': `
import * as React from "react";
export default function (props: any) {
    return <p>Hello!</p>;
}
export function MyComp2(props: any) {
    return <p>Hello!</p>;
}
export const MyConst = "123";
      `,
    'component2.tsx': `
import * as React from "react";
import MyComp1, { MyComp2, MyConst } from "./component1";
export default function (props: any) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
const y = MyConst;
      `,
  };

  const expected = {
    'component1.jsx': `
import * as React from "react";
export default function (props) {
    return <p>Hello!</p>;
}
export function MyComp2(props) {
    return <p>Hello!</p>;
}
export const MyConst = "123";
      `,
    'component2.jsx': `
import * as React from "react";
import MyComp1, { MyComp2, MyConst } from "./component1";
export default function (props) {
    return <p><MyComp1 /><MyComp2 /></p>;
}
const y = MyConst;
      `,
  };

  expectEqual(
    expected,
    compile(code, {
      onlyRewriteIfImportCanBeRemoved: true,
    }),
  );
});

function expectEqual(expected: Code, compiled: Code) {
  Object.keys(expected).forEach(fileName => {
    expect(fileName + ':\n' + (compiled[fileName] || '').trim()).toBe(
      fileName + ':\n' + (expected[fileName] || '').trim(),
    );
  });
}
