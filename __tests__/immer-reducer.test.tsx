import {
    ImmerReducer,
    createReducerFunction,
    createActionCreators,
    composeReducers,
    setPrefix,
    _clearKnownClasses,
    isAction,
    isActionFrom, beginAccumulatingPatches, popAccumulatedPatches, stopAccumulatingPatches,
} from "../src/immer-reducer";

import {createStore, combineReducers, Action} from "redux";
import {applyPatches, Patch} from "immer";

beforeEach(_clearKnownClasses);

afterEach(() => {
    setPrefix("IMMER_REDUCER");
});

test("can detect inherited actions", () => {
    class Parent extends ImmerReducer<any> {
        setFoo(foo: string) {}
    }

    class Child extends Parent {
        setFoo2(foo: string) {}
    }

    const actions = createActionCreators(Child);
    expect(actions.setFoo).toBeTruthy();
    expect(actions.setFoo2).toBeTruthy();
});

test("can create reducers", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const reducer = createReducerFunction(TestReducer);
    const store = createStore(reducer, initialState);

    expect(store.getState()).toEqual({foo: "bar"});
});

test("the reducer can return the initial state", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const reducer = createReducerFunction(TestReducer, initialState);
    const store = createStore(reducer);

    expect(store.getState()).toEqual({foo: "bar"});
});

test("can dispatch actions", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        noop() {}
    }

    const ActionCreators = createActionCreators(TestReducer);
    const reducer = createReducerFunction(TestReducer, initialState);
    const store = createStore(reducer);

    store.dispatch(ActionCreators.noop());

    expect(store.getState()).toEqual({foo: "bar"});
});

test("can update state", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const ActionCreators = createActionCreators(TestReducer);
    const reducer = createReducerFunction(TestReducer, initialState);
    const store = createStore(reducer);

    store.dispatch(ActionCreators.setFoo("next"));

    expect(store.getState()).toEqual({foo: "next"});
});

test("can update state using multiple methods", () => {
    const initialState = {foo: "bar", bar: 1};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }

        setBar(bar: number) {
            this.draftState.bar = bar;
        }

        setBoth(foo: string, bar: number) {
            this.setFoo(foo);
            this.setBar(bar);
        }
    }

    const ActionCreators = createActionCreators(TestReducer);
    const reducer = createReducerFunction(TestReducer, initialState);
    const store = createStore(reducer);

    store.dispatch(ActionCreators.setBoth("next", 2));

    expect(store.getState()).toEqual({foo: "next", bar: 2});
});

test("the actual action type name is prefixed", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const ActionCreators = createActionCreators(TestReducer);

    const reducer = createReducerFunction(TestReducer, initialState);
    const reducerSpy: typeof reducer = jest.fn(reducer);

    const store = createStore(reducerSpy);

    store.dispatch(ActionCreators.setFoo("next"));

    expect(reducerSpy).toHaveBeenLastCalledWith(
        {foo: "bar"},
        {
            payload: "next",
            type: "IMMER_REDUCER:TestReducer#setFoo",
        },
    );
});

test("can add helpers to the class", () => {
    const initialState = {foo: 1, bar: 1};

    class Helper {
        state: typeof initialState;

        constructor(state: typeof initialState) {
            this.state = state;
        }

        getCombined() {
            return this.state.foo + this.state.bar;
        }
    }

    class TestReducer extends ImmerReducer<typeof initialState> {
        helper = new Helper(this.state);

        combineToBar() {
            this.draftState.bar = this.helper.getCombined();
        }
    }

    const ActionCreators = createActionCreators(TestReducer);
    const reducer = createReducerFunction(TestReducer, initialState);
    const store = createStore(reducer);

    store.dispatch(ActionCreators.combineToBar());

    expect(store.getState()).toEqual({foo: 1, bar: 2});
});

test("can use combineReducers", () => {
    interface State1 {
        foo: number;
    }

    interface State2 {
        bar: string;
    }

    class TestReducer1 extends ImmerReducer<State1> {
        setFoo(foo: number) {
            this.draftState.foo = foo;
        }
    }

    class TestReducer2 extends ImmerReducer<State2> {
        setBar(bar: string) {
            this.draftState.bar = bar;
        }
    }

    const ActionCreators1 = createActionCreators(TestReducer1);
    const ActionCreators2 = createActionCreators(TestReducer2);

    const slice1 = createReducerFunction(TestReducer1, {foo: 0});
    const slice2 = createReducerFunction(TestReducer2, {bar: ""});

    const combined = combineReducers({slice1, slice2});

    const store = createStore(combined);

    store.dispatch(ActionCreators1.setFoo(1));
    store.dispatch(ActionCreators2.setBar("barval"));

    const state: {
        slice1: State1;
        slice2: State2;
    } = store.getState();

    expect(state).toEqual({slice1: {foo: 1}, slice2: {bar: "barval"}});
});

test("cannot collide reducers", () => {
    const initialState = {foo: "bar"};

    class TestReducer1 extends ImmerReducer<typeof initialState> {
        setFoo() {
            this.draftState.foo = "1";
        }
    }

    class TestReducer2 extends ImmerReducer<typeof initialState> {
        setFoo() {
            this.draftState.foo = "2";
        }
    }

    const reducer = composeReducers(
        createReducerFunction(TestReducer1),
        createReducerFunction(TestReducer2),
    );

    const store = createStore(reducer, initialState);

    const ActionCreators1 = createActionCreators(TestReducer1);
    const ActionCreators2 = createActionCreators(TestReducer2);

    store.dispatch(ActionCreators1.setFoo());
    expect(store.getState()).toEqual({foo: "1"});

    store.dispatch(ActionCreators2.setFoo());
    expect(store.getState()).toEqual({foo: "2"});
});

test("dynamically generated reducers do not collide", () => {
    const initialState = {
        foo: "",
    };

    function createGenericReducer<T extends {[key: string]: unknown}>(
        value: string,
    ) {
        return class GenericReducer extends ImmerReducer<T> {
            set() {
                Object.assign(this.draftState, {foo: value});
            }
        };
    }
    const ReducerClass1 = createGenericReducer<typeof initialState>("1");
    const ReducerClass2 = createGenericReducer<typeof initialState>("2");

    const reducer1 = createReducerFunction(ReducerClass1, initialState);
    const reducer2 = createReducerFunction(ReducerClass2, initialState);

    const reducer = composeReducers(reducer1, reducer2);

    const ActionCreators1 = createActionCreators(ReducerClass1);
    const ActionCreators2 = createActionCreators(ReducerClass2);

    const store = createStore(reducer);

    store.dispatch(ActionCreators1.set());
    expect(store.getState().foo).toEqual("1");

    store.dispatch(ActionCreators2.set());
    expect(store.getState().foo).toEqual("2");
});

test("can create dynamic reducers after creating actions", () => {
    const initialState = {
        foo: "",
    };

    function createGenericReducer<T extends {[key: string]: unknown}>(
        value: string,
    ) {
        return class GenericReducer extends ImmerReducer<T> {
            set() {
                Object.assign(this.draftState, {foo: value});
            }
        };
    }
    const ReducerClass1 = createGenericReducer<typeof initialState>("1");
    const ReducerClass2 = createGenericReducer<typeof initialState>("2");

    const ActionCreators1 = createActionCreators(ReducerClass1);
    const ActionCreators2 = createActionCreators(ReducerClass2);

    const reducer1 = createReducerFunction(ReducerClass1, initialState);
    const reducer2 = createReducerFunction(ReducerClass2, initialState);

    const reducer = composeReducers(reducer1, reducer2);

    const store = createStore(reducer);

    store.dispatch(ActionCreators1.set());
    expect(store.getState().foo).toEqual("1");

    store.dispatch(ActionCreators2.set());
    expect(store.getState().foo).toEqual("2");
});

test("throw error when using duplicate customNames", () => {
    class Reducer1 extends ImmerReducer<{foo: string}> {
        static customName = "dup";
        set() {
            this.draftState.foo = "foo";
        }
    }

    class Reducer2 extends ImmerReducer<{foo: string}> {
        static customName = "dup";
        set() {
            this.draftState.foo = "foo";
        }
    }

    createReducerFunction(Reducer1);

    expect(() => {
        createReducerFunction(Reducer2);
    }).toThrow();
});

test("action creators expose the actual action type name", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setBar(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const ActionCreators = createActionCreators(TestReducer);

    expect(ActionCreators.setBar.type).toEqual(
        "IMMER_REDUCER:TestReducer#setBar",
    );
});

test("can customize prefix of action type name what is returned by action creator.", () => {
    const initialState = {foo: "bar"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setBar(foo: string) {
            this.draftState.foo = foo;
        }
    }

    setPrefix("AWESOME_LIBRARY");
    const ActionCreators = createActionCreators(TestReducer);

    expect(ActionCreators.setBar.type).toEqual(
        "AWESOME_LIBRARY:TestReducer#setBar",
    );

    const reducer = createReducerFunction(TestReducer);
    const store = createStore(reducer, initialState);

    store.dispatch(ActionCreators.setBar("ding"));

    expect(store.getState()).toEqual({foo: "ding"});
});

test("isActionFrom can detect actions", () => {
    class TestReducer extends ImmerReducer<{foo: string}> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }
    const ActionCreators = createActionCreators(TestReducer);

    const action1: Action = ActionCreators.setFoo("foo");

    const action2: Action = {
        type: "other",
    };

    expect(isActionFrom(action1, TestReducer)).toBe(true);
    expect(isActionFrom(action2, TestReducer)).toBe(false);
});

test("isAction can detect actions", () => {
    class TestReducer extends ImmerReducer<{foo: string}> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }
    const ActionCreators = createActionCreators(TestReducer);

    const action1: Action = ActionCreators.setFoo("foo");

    const action2: Action = {
        type: "other",
    };

    expect(isAction(action1, ActionCreators.setFoo)).toBe(true);
    expect(isAction(action2, ActionCreators.setFoo)).toBe(false);
});

test("single argument is the payload value", () => {
    class TestReducer extends ImmerReducer<{}> {
        singleArg(arg: string) {}
    }
    const action = createActionCreators(TestReducer).singleArg("foo");
    expect(action.payload).toEqual("foo");
});

test("multiple arguments are as an array in the payload", () => {
    class TestReducer extends ImmerReducer<{}> {
        multiple(arg1: string, arg2: number) {}
    }
    const action = createActionCreators(TestReducer).multiple("foo", 2);
    expect(action.payload).toEqual(["foo", 2]);
});

test("single argument can be an array", () => {
    class TestReducer extends ImmerReducer<{}> {
        singleArg(arg: string[]) {}
    }
    const action = createActionCreators(TestReducer).singleArg(["foo"]);
    expect(action.payload).toEqual(["foo"]);
});

test("single array argument is dispatched correctly", () => {
    expect.assertions(1);

    class TestReducer extends ImmerReducer<{}> {
        arrayArg(arr: string[]) {
            expect(arr).toEqual(["foo", "bar"]);
        }
    }

    const store = createStore(createReducerFunction(TestReducer, {}));
    store.dispatch(createActionCreators(TestReducer).arrayArg(["foo", "bar"]));
});

test("puts only defined arguments to the action object", () => {
    class TestReducer extends ImmerReducer<{}> {
        doIt() {}
    }

    // Simulate click handler type
    let onClick = (arg: string): any => {};

    // "Pass action the event handler"
    onClick = createActionCreators(TestReducer).doIt;

    const action = onClick("nope");

    expect(action.payload).toEqual([]);
});

test("puts only defined arguments to the action object", () => {
    class TestReducer extends ImmerReducer<{}> {
        doIt(oneArg: string) {}
    }

    // Simulate click handler type
    let onClick = (first: string, second: string): any => {};

    // "Pass action the event handler"
    onClick = createActionCreators(TestReducer).doIt;

    const action = onClick("yes", "nope");

    expect(action.payload).toEqual("yes");
});

test("can replace the draft state with completely new state", () => {
    const initialState = {foo: "bar", ding: "ding"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        resetState() {
            this.draftState = {
                foo: "new",
                ding: "new",
            };
        }
    }

    const ActionCreators = createActionCreators(TestReducer);

    const reducer = createReducerFunction(TestReducer);
    const store = createStore(reducer, initialState);

    store.dispatch(ActionCreators.resetState());

    expect(store.getState()).toEqual({
        foo: "new",
        ding: "new",
    });
});

test("can accumulate patches from a single reducer", () => {
    const initialState = {foo: "foo"};

    class TestReducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const ActionCreators = createActionCreators(TestReducer);

    const reducer = createReducerFunction(TestReducer);
    const store = createStore(reducer, initialState);

    beginAccumulatingPatches();
    store.dispatch(ActionCreators.setFoo("foo2"));
    store.dispatch(ActionCreators.setFoo("foo3"));

    try {
        expect(popAccumulatedPatches()).toEqual([
            {
                op: "replace",
                path: ["foo"],
                value: "foo2"
            },
            {
                op: "replace",
                path: ["foo"],
                value: "foo3"
            }]);

        expect(popAccumulatedPatches()).toEqual([]);
    } finally {
        stopAccumulatingPatches();
    }
});

test("can accumulate patches from multiple reducers", () => {
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
});