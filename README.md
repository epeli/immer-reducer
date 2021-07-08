# immer-reducer

Type-safe and terse reducers with Typescript for React Hooks and Redux using [Immer](https://immerjs.github.io/immer/)!

## 📦 Install

    npm install immer-reducer

You can also install [eslint-plugin-immer-reducer](https://github.com/skoshy/eslint-plugin-immer-reducer) to help you avoid errors when writing your reducer.

## 💪 Motivation

Turn this 💩 💩 💩

```ts
interface SetFirstNameAction {
    type: "SET_FIRST_NAME";
    firstName: string;
}

interface SetLastNameAction {
    type: "SET_LAST_NAME";
    lastName: string;
}

type Action = SetFirstNameAction | SetLastNameAction;

function reducer(action: Action, state: State): State {
    switch (action.type) {
        case "SET_FIRST_NAME":
            return {
                ...state,
                user: {
                    ...state.user,
                    firstName: action.firstName,
                },
            };
        case "SET_LAST_NAME":
            return {
                ...state,
                user: {
                    ...state.user,
                    lastName: action.lastName,
                },
            };
        default:
            return state;
    }
}
```

✨✨ Into this! ✨✨

```ts
import {ImmerReducer} from "immer-reducer";

class MyImmerReducer extends ImmerReducer<State> {
    setFirstName(firstName: string) {
        this.draftState.user.firstName = firstName;
    }

    setLastName(lastName: string) {
        this.draftState.user.lastName = lastName;
    }
}
```

🔥🔥 **Without losing type-safety!** 🔥🔥

Oh, and you get the action creators for free! 🤗 🎂

## 📖 Usage

Generate Action Creators and the actual reducer function for Redux from the class with

```ts
import {createStore} from "redux";
import {createActionCreators, createReducerFunction} from "immer-reducer";

const initialState: State = {
    user: {
        firstName: "",
        lastName: "",
    },
};

const ActionCreators = createActionCreators(MyImmerReducer);
const reducerFunction = createReducerFunction(MyImmerReducer, initialState);

const store = createStore(reducerFunction);
```

Dispatch some actions

```ts
store.dispatch(ActionCreators.setFirstName("Charlie"));
store.dispatch(ActionCreators.setLastName("Brown"));

expect(store.getState().user.firstName).toEqual("Charlie");
expect(store.getState().user.lastName).toEqual("Brown");
```

## 🌟 Typed Action Creators!

The generated `ActionCreator` object respect the types used in the class

```ts
const action = ActionCreators.setFirstName("Charlie");
action.payload; // Has the type of string

ActionCreators.setFirstName(1); // Type error. Needs string.
ActionCreators.setWAT("Charlie"); // Type error. Unknown method
```

If the reducer class where to have a method which takes more than one argument
the payload would be array of the arguments

```ts
// In the Reducer class:
// setName(firstName: string, lastName: string) {}
const action = ActionCreators.setName("Charlie", "Brown");
action.payload; // will have value ["Charlie", "Brown"] and type [string, string]
```

The reducer function is also typed properly

```ts
const reducer = createReducerFunction(MyImmerReducer);

reducer(initialState, ActionCreators.setFirstName("Charlie")); // OK
reducer(initialState, {type: "WAT"}); // Type error
reducer({wat: "bad state"}, ActionCreators.setFirstName("Charlie")); // Type error
```

## ⚓ React Hooks

Because the `useReducer()` API in React Hooks is the same as with Redux
Reducers immer-reducer can be used with as is.

```tsx
const initialState = {message: ""};

class ReducerClass extends ImmerReducer<typeof initialState> {
    setMessage(message: string) {
        this.draftState.message = message;
    }
}

const ActionCreators = createActionCreators(ReducerClass);
const reducerFunction = createReducerFunction(ReducerClass);

function Hello() {
    const [state, dispatch] = React.useReducer(reducerFunction, initialState);

    return (
        <button
            data-testid="button"
            onClick={() => {
                dispatch(ActionCreators.setMessage("Hello!"));
            }}
        >
            {state.message}
        </button>
    );
}
```

The returned state and dispatch functions will be typed as you would expect.

## 🤔 How

Under the hood the class is deconstructed to following actions:

```js
{
    type: "IMMER_REDUCER:MyImmerReducer#setFirstName",
    payload: "Charlie",
}
{
    type: "IMMER_REDUCER:MyImmerReducer#setLastName",
    payload: "Brown",
}
{
    type: "IMMER_REDUCER:MyImmerReducer#setName",
    payload: ["Charlie", "Brown"],
    args: true
}
```

So the class and method names become the Redux Action Types and the method
arguments become the action payloads. The reducer function will then match
these actions against the class and calls the appropriate methods with the
payload array spread to the arguments.

🚫 The format of the `action.type` string is internal to immer-reducer. If
you need to detect the actions use the provided type guards.

The generated reducer function executes the methods inside the `produce()`
function of Immer enabling the terse mutatable style updates.

## 🔄 Integrating with the Redux ecosystem

To integrate for example with the side effects libraries such as
[redux-observable](https://github.com/redux-observable/redux-observable/) and
[redux-saga](https://github.com/redux-saga/redux-saga), you can access the
generated action type using the `type` property of the action creator
function.

With redux-observable

```ts
// Get the action name to subscribe to
const setFirstNameActionTypeName = ActionCreators.setFirstName.type;

// Get the action type to have a type safe Epic
type SetFirstNameAction = ReturnType<typeof ActionCreators.setFirstName>;

const setFirstNameEpic: Epic<SetFirstNameAction> = action$ =>
  action$
    .ofType(setFirstNameActionTypeName)
    .pipe(
      // action.payload - recognized as string
      map(action => action.payload.toUpperCase()),
      ...
    );
```

With redux-saga

```ts
function* watchFirstNameChanges() {
    yield takeEvery(ActionCreators.setFirstName.type, doStuff);
}

// or use the isActionFrom() to get all actions from a specific ImmerReducer
// action creators object
function* watchImmerActions() {
    yield takeEvery(
        (action: Action) => isActionFrom(action, MyImmerReducer),
        handleImmerReducerAction,
    );
}

function* handleImmerReducerAction(action: Actions<typeof MyImmerReducer>) {
    // `action` is a union of action types
    if (isAction(action, ActionCreators.setFirstName)) {
        // with action of setFirstName
    }
}
```

**Warning:** Due to how immer-reducers action generation works, adding default
parameters to the methods will NOT pass it to the action payload, which can
make your reducer impure and the values will not be available in middlewares.

```ts
class MyImmerReducer extends ImmerReducer<State> {
    addItem (id: string = uuid()) {
        this.draftState.ids.push([id])
    }
}

immerActions.addItem() // generates empty payload { payload: [] }
```

As a workaround, create custom action creator wrappers that pass the default parameters instead.

```ts
class MyImmerReducer extends ImmerReducer<State> {
    addItem (id) {
        this.draftState.ids.push([id])
    }
}

const actions = {
  addItem: () => immerActions.addItem(id)
}
```

It is also recommended to install the ESLint plugin in the "Install" section
to alert you if you accidentally encounter this issue.

## 📚 Examples

Here's a more complete example with redux-saga and [redux-render-prop](https://github.com/epeli/redux-render-prop):

<https://github.com/epeli/typescript-redux-todoapp>

## 🃏 Tips and Tricks

You can replace the whole `draftState` with a new state if you'd like. This could be useful if you'd like to reset back to your initial state.

```ts
import {ImmerReducer} from "immer-reducer";

const initialState: State = {
    user: {
        firstName: "",
        lastName: "",
    },
};

class MyImmerReducer extends ImmerReducer<State> {
    // omitting other reducer methods
    
    reset() {
        this.draftState = initialState;
    }
}
```

## 📓 Helpers

The module exports following helpers

### `function isActionFrom(action, ReducerClass)`

Type guard for detecting whether the given action is generated by the given
reducer class. The detected type will be union of actions the class
generates.

Example

```ts
if (isActionFrom(someAction, ActionCreators)) {
    // someAction now has type of
    // {
    //     type: "setFirstName";
    //     payload: string;
    // } | {
    //     type: "setLastName";
    //     payload: string;
    // };
}
```

### `function isAction(action, actionCreator)`

Type guard for detecting specific actions generated by immer-reducer.

Example

```ts
if (isAction(someAction, ActionCreators.setFirstName)) {
    someAction.payload; // Type checks to `string`
}
```

### `type Actions<ImmerReducerClass>`

Get union of the action types generated by the ImmerReducer class

Example

```ts
type MyActions = Actions<typeof MyImmerReducer>;

// Is the same as
type MyActions =
    | {
          type: "setFirstName";
          payload: string;
      }
    | {
          type: "setLastName";
          payload: string;
      };
```

### `function setPrefix(prefix: string)`

The default prefix in the generated action types is `IMMER_REDUCER`. Call
this customize it for your app.

Example

```ts
setPrefix("MY_APP");
```

### `function composeReducers<State>(...reducers)`

Utility that reduces actions by applying them through multiple reducers.
This helps in allowing you to split up your reducer logic to multiple `ImmerReducer`s
if they affect the same part of your state

Example

```ts
class MyNameReducer extends ImmerReducer<NamesState> {
    setFirstName(firstName: string) {
        this.draftState.firstName = firstName;
    }

    setLastName(lastName: string) {
        this.draftState.lastName = lastName;
    }
}

class MyAgeReducer extends ImmerReducer<AgeState> {
    setAge(age: number) {
        this.draftState.age = 8;
    }
}

export const reducer = composeReducers(
  createReducerFunction(MyNameReducer, initialState),
  createReducerFunction(MyAgeReducer, initialState)
)
```

### `function beginAccumulatingPatches()`

Enable accumulation of immer patches.
Note: There is a performance penalty to immer's patching mechanism

Example

```ts
beginAccumulatingPatches();
```

### `function popAccumulatedPatches(): Patch[]`

Removed and return the accumulated patches.
If your reducer will be combined with others using redux's `combineReducers` function,
you may specify a `static patchPathPrefix: string[]` in your reducer class to produce patches that
can be applied to the top level state.

Example

```ts
    const initialState = {foo: "foo"};

    class R1 extends ImmerReducer<typeof initialState> {
        static patchPathPrefix = ["r1"];
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    class R2 extends R1 {
        static patchPathPrefix = ["r2"];
    }

    const ActionCreators1 = createActionCreators(R1);
    const ActionCreators2 = createActionCreators(R2);

    const r1 = createReducerFunction(R1, initialState);
    const r2 = createReducerFunction(R2, initialState);

    const reducer = combineReducers({r1, r2});

    const store = createStore(reducer);

    beginAccumulatingPatches();
    store.dispatch(ActionCreators1.setFoo("foo2"));
    store.dispatch(ActionCreators2.setFoo("foo3"));

    try {
        const patches = popAccumulatedPatches();
        expect(patches).toEqual([
            {
                op: "replace",
                path: ["r1", "foo"],
                value: "foo2"
            },
            {
                op: "replace",
                path: ["r2", "foo"],
                value: "foo3"
            }]);

        expect(popAccumulatedPatches()).toEqual([]);

        expect(applyPatches({r1: initialState, r2: initialState}, patches))
            .toEqual(store.getState());
    } finally {
        stopAccumulatingPatches();
    }
```

### `function stopAccumulatingPatches()`

Disable accumulation of immer patches.

Example

```ts
stopAccumulatingPatches();
```
