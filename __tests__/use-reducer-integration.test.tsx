import React from "react";
import {render, fireEvent, cleanup} from "@testing-library/react";
import {
    ImmerReducer,
    createActionCreators,
    createReducerFunction,
} from "../src/immer-reducer";

afterEach(cleanup);

test("can use with React.useReducer()", () => {
    const initialState = {foo: ""};

    class Reducer extends ImmerReducer<typeof initialState> {
        setFoo(foo: string) {
            this.draftState.foo = foo;
        }
    }

    const ActionCreators = createActionCreators(Reducer);
    const reducerFunction = createReducerFunction(Reducer);

    function Foo() {
        const [state, dispatch] = React.useReducer(
            reducerFunction,
            initialState,
        );

        return (
            <button
                data-testid="button"
                onClick={() => {
                    dispatch(ActionCreators.setFoo("clicked"));
                }}
            >
                {state.foo}
            </button>
        );
    }

    const rtl = render(<Foo />);
    const button = rtl.getByTestId("button");

    fireEvent.click(button);

    expect(button.innerHTML).toBe("clicked");
});
