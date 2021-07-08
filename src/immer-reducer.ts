import produce, {Draft, Patch, produceWithPatches} from "immer";

let actionTypePrefix : string = "IMMER_REDUCER";
let accumulatePatches : boolean = false;
let patches : Patch[] = [];

/** get function arguments as tuple type */
type ArgumentsType<T> = T extends (...args: infer V) => any ? V : never;

/**
 * Get the first value of tuple when the tuple length is 1 otherwise return the
 * whole tuple
 */
type FirstOrAll<T> = T extends [infer V] ? V : T;

/** Get union of function property names */
type FunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

type MethodObject = {[key: string]: () => any};

/** Pick only methods from object */
type Methods<T> = Pick<T, FunctionPropertyNames<T>>;

/** flatten functions in an object to their return values */
type FlattenToReturnTypes<T extends MethodObject> = {
    [K in keyof T]: ReturnType<T[K]>;
};

/** get union of object value types */
type ObjectValueTypes<T> = T[keyof T];

/** get union of object method return types */
type ReturnTypeUnion<T extends MethodObject> = ObjectValueTypes<
    FlattenToReturnTypes<T>
>;

/**
 * Get union of actions types from a ImmerReducer class
 */
export type Actions<T extends ImmerReducerClass> = ReturnTypeUnion<
    ActionCreators<T>
>;

/** type constraint for the ImmerReducer class  */
export interface ImmerReducerClass {
    customName?: string;
    patchPathPrefix?: string[];
    new (...args: any[]): ImmerReducer<any>;
}

/** get state type from a ImmerReducer subclass */
export type ImmerReducerState<T> = T extends {
    prototype: {
        state: infer V;
    };
}
    ? V
    : never;

/** generate reducer function type from the ImmerReducer class */
export interface ImmerReducerFunction<T extends ImmerReducerClass> {
    (
        state: ImmerReducerState<T> | undefined,
        action: ReturnTypeUnion<ActionCreators<T>>,
    ): ImmerReducerState<T>;
}

/** ActionCreator function interface with actual action type name */
interface ImmerActionCreator<ActionTypeType, Payload extends any[]> {
    readonly type: ActionTypeType;

    (...args: Payload): {
        type: ActionTypeType;
        payload: FirstOrAll<Payload>;
    };
}

/** generate ActionCreators types from the ImmerReducer class */
export type ActionCreators<ClassActions extends ImmerReducerClass> = {
    [K in keyof Methods<InstanceType<ClassActions>>]: ImmerActionCreator<
        K,
        ArgumentsType<InstanceType<ClassActions>[K]>
    >;
};

/**
 * Internal type for the action
 */
type ImmerAction =
    | {
          type: string;
          payload: unknown;
          args?: false;
      }
    | {
          type: string;
          payload: unknown[];
          args: true;
      };

/**
 * Type guard for detecting actions created by immer reducer
 *
 * @param action any redux action
 * @param immerActionCreator method from a ImmerReducer class
 */
export function isAction<A extends ImmerActionCreator<any, any>>(
    action: {type: any},
    immerActionCreator: A,
): action is ReturnType<A> {
    return action.type === immerActionCreator.type;
}

function isActionFromClass<T extends ImmerReducerClass>(
    action: {type: any},
    immerReducerClass: T,
): action is Actions<T> {
    if (typeof action.type !== "string") {
        return false;
    }

    if (!action.type.startsWith(actionTypePrefix + ":")) {
        return false;
    }

    const [className, methodName] = removePrefix(action.type).split("#");

    if (className !== getReducerName(immerReducerClass)) {
        return false;
    }

    if (typeof immerReducerClass.prototype[methodName] !== "function") {
        return false;
    }

    return true;
}

export function isActionFrom<T extends ImmerReducerClass>(
    action: {type: any},
    immerReducerClass: T,
): action is Actions<T> {
    return isActionFromClass(action, immerReducerClass);
}

interface Reducer<State> {
    (state: State | undefined, action: any): State;
}

/**
 * Combine multiple reducers into a single one
 *
 * @param reducers two or more reducer
 */
export function composeReducers<State>(
    ...reducers: Reducer<State | undefined>[]
): Reducer<State> {
    return (state: any, action: any) => {
        return (
            reducers.reduce((state, subReducer) => {
                if (typeof subReducer === "function") {
                    return subReducer(state, action);
                }

                return state;
            }, state) || state
        );
    };
}

/** The actual ImmerReducer class */
export class ImmerReducer<T> {
    static customName?: string;
    static patchPathPrefix?: string[];
    readonly state: T;
    draftState: Draft<T>; // Make read only states mutable using Draft

    constructor(draftState: Draft<T>, state: T) {
        this.state = state;
        this.draftState = draftState;
    }
}

function removePrefix(actionType: string) {
    return actionType
        .split(":")
        .slice(1)
        .join(":");
}

let KNOWN_REDUCER_CLASSES: typeof ImmerReducer[] = [];

const DUPLICATE_INCREMENTS: {[name: string]: number | undefined} = {};

/**
 * Set customName for classes automatically if there is multiple reducers
 * classes defined with the same name. This can occur accidentaly when using
 * name mangling with minifiers.
 *
 * @param immerReducerClass
 */
function setCustomNameForDuplicates(immerReducerClass: typeof ImmerReducer) {
    const hasSetCustomName = KNOWN_REDUCER_CLASSES.find(klass =>
        Boolean(klass === immerReducerClass),
    );

    if (hasSetCustomName) {
        return;
    }

    const duplicateCustomName =
        immerReducerClass.customName &&
        KNOWN_REDUCER_CLASSES.find(klass =>
            Boolean(
                klass.customName &&
                    klass.customName === immerReducerClass.customName,
            ),
        );

    if (duplicateCustomName) {
        throw new Error(
            `There is already customName ${immerReducerClass.customName} defined for ${duplicateCustomName.name}`,
        );
    }

    const duplicate = KNOWN_REDUCER_CLASSES.find(
        klass => klass.name === immerReducerClass.name,
    );

    if (duplicate && !duplicate.customName) {
        let number = DUPLICATE_INCREMENTS[immerReducerClass.name];

        if (number) {
            number++;
        } else {
            number = 1;
        }

        DUPLICATE_INCREMENTS[immerReducerClass.name] = number;

        immerReducerClass.customName = immerReducerClass.name + "_" + number;
    }

    KNOWN_REDUCER_CLASSES.push(immerReducerClass);
}

/**
 * Convert function arguments to ImmerAction object
 */
function createImmerAction(type: string, args: unknown[]): ImmerAction {
    if (args.length === 1) {
        return {type, payload: args[0]};
    }

    return {
        type,
        payload: args,
        args: true,
    };
}

/**
 * Get function arguments from the ImmerAction object
 */
function getArgsFromImmerAction(action: ImmerAction): unknown[] {
    if (action.args) {
        return action.payload;
    }

    return [action.payload];
}

function getAllPropertyNames(obj: object) {
    const proto = Object.getPrototypeOf(obj);
    const inherited: string[] = proto ? getAllPropertyNames(proto) : [];
    return Object.getOwnPropertyNames(obj)
        .concat(inherited)
        .filter(
            (propertyName, index, uniqueList) =>
                uniqueList.indexOf(propertyName) === index,
        );
}

export function createActionCreators<T extends ImmerReducerClass>(
    immerReducerClass: T,
): ActionCreators<T> {
    setCustomNameForDuplicates(immerReducerClass);

    const actionCreators: {[key: string]: Function} = {};
    const immerReducerProperties = getAllPropertyNames(ImmerReducer.prototype);
    getAllPropertyNames(immerReducerClass.prototype).forEach(key => {
        if (immerReducerProperties.includes(key)) {
            return;
        }
        const method = immerReducerClass.prototype[key];

        if (typeof method !== "function") {
            return;
        }

        const type = `${actionTypePrefix}:${getReducerName(
            immerReducerClass,
        )}#${key}`;

        const actionCreator = (...args: any[]) => {
            // Make sure only the arguments are passed to the action object that
            // are defined in the method
            return createImmerAction(type, args.slice(0, method.length));
        };
        actionCreator.type = type;
        actionCreators[key] = actionCreator;
    });

    return actionCreators as any; // typed in the function signature
}

function getReducerName(klass: {name: string; customName?: string}) {
    const name = klass.customName || klass.name;
    if (!name) {
        throw new Error(
            `immer-reducer failed to get reducer name for a class. Try adding 'static customName = "name"'`,
        );
    }
    return name;
}

export function createReducerFunction<T extends ImmerReducerClass>(
    immerReducerClass: T,
    initialState?: ImmerReducerState<T>,
): ImmerReducerFunction<T> {
    setCustomNameForDuplicates(immerReducerClass);

    return function immerReducerFunction(state, action) {
        if (state === undefined) {
            state = initialState;
        }

        if (!isActionFromClass(action, immerReducerClass)) {
            return state;
        }

        if (!state) {
            throw new Error(
                "ImmerReducer does not support undefined state. Pass initial state to createReducerFunction() or createStore()",
            );
        }

        const [_, methodName] = removePrefix(action.type as string).split("#");

        const reducer = (draftState : T) => {
            const reducers: any = new immerReducerClass(draftState, state);

            reducers[methodName](...getArgsFromImmerAction(action as any));

            // The reducer replaced the instance with completely new state so
            // make that to be the next state
            if (reducers.draftState !== draftState) {
                return reducers.draftState;
            }

            return draftState;

            // Workaround typing changes in Immer 9.x. This does not actually
            // affect the exposed types by immer-reducer itself.

            // Also using immer internally with anys like this allow us to
            // support multiple versions of immer.
        };

        if (accumulatePatches) {
            const [newState, newPatches, _]: [T, Patch[], Patch[]] = produceWithPatches(state, reducer);
            if (immerReducerClass.patchPathPrefix) {
                newPatches.forEach(patch =>
                    patch.path.unshift(...immerReducerClass.patchPathPrefix!));
            }
            patches.push(...newPatches);
            return newState;
        } else {
            return produce(state, reducer);
        }
    };
}

export function setPrefix(prefix: string): void {
    actionTypePrefix = prefix;
}

export function beginAccumulatingPatches(): void {
    accumulatePatches = true;
    patches = [];
}

export function popAccumulatedPatches(): Patch[] {
    const accumulated = patches;
    patches = [];
    return accumulated;
}

export function stopAccumulatingPatches(): void {
    accumulatePatches = false;
    patches = [];
}

/**
 * INTERNAL! This is only for tests!
 */
export function _clearKnownClasses() {
    KNOWN_REDUCER_CLASSES = [];
}

/**
 * https://webpack.js.org/api/hot-module-replacement/#module-api
 */
interface WebpackModule {
    hot?: {
        status(): string;
        addStatusHandler?: (handler: (status: string) => void) => void;
    };
}

/**
 * Webpack Module global if using Wepback
 */
declare const module: WebpackModule | undefined;

if (typeof module !== "undefined") {
    // Clear classes on Webpack Hot Module replacement as it will mess up the
    // duplicate checks appear
    module.hot?.addStatusHandler?.(status => {
        if (status === "prepare") {
            _clearKnownClasses();
        }
    });
}
