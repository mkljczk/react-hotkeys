import isBool from 'lodash/isBoolean';
import isEqual from 'lodash/isEqual';
import isObject from 'lodash/isObject';
import Mousetrap from 'mousetrap';
import React from 'react';
import ReactDOM from 'react-dom';

import FocusTrap from './focus-trap';
import hasChanged from './utils/has-changed';
import sequencesFromKeyMap from './utils/sequences-from-key-map';

import type { HotKey, HotKeyMap, SequenceHandler } from './types';

interface Context {
  /**
   * Reference to the most direct ancestor that is a HotKeys component (if one
   * exists) so that messages may be passed to it when necessary
   */
  hotKeyParent: HotKeys | null;

  /**
   * Reference to the KeyMap of its most direct HotKeys ancestor, so that it may
   * be merged into this components
   */
  hotKeyMap: HotKeyMap | null;
}

const HotKeysContext = React.createContext<Context>({
  hotKeyParent: null,
  hotKeyMap: null,
});

export type HotKeysProps = {
  /** A map from action names to Mousetrap key sequences */
  keyMap?: HotKeyMap;
  /** A map from action names to event handler functions */
  handlers?: Record<string, (event?: KeyboardEvent, sequence?: string) => void>;
  /** Whether HotKeys should behave as if it has focus in the browser,
      whether it does or not - a way to force focus behaviour */
  focused?: boolean;
  /** Children to wrap within a focus trap */
  children: React.ReactNode;
  /** Function to call when this component gains focus in the browser */
  onFocus?: React.FocusEventHandler<Element>;
  /** Function to call when this component loses focus in the browser */
  onBlur?: React.FocusEventHandler<Element>;
  component?: keyof JSX.IntrinsicElements | React.ComponentType;
} & ({
  /** The DOM element the keyboard listeners should be attached to */
  attach: Element | Window;
} | {
  /** The ref container for the DOM element the keyboard listeners should be attached to */
  attachRef: React.RefObject<Element>;
})

/**
 * Component that wraps it children in a "focus trap" and allows key events to
 * trigger function handlers when its children are in focus
 */
class HotKeys extends React.Component<HotKeysProps> {

  __isFocused__ = false;
  __hotKeyMap__: HotKeyMap | null = null;
  __mousetrap__: ReturnType<typeof Mousetrap> | null = null;
  __lastChildSequence__: HotKey | null = null;

  static contextType = HotKeysContext;
  declare context: React.ContextType<typeof HotKeysContext>;

  constructor(props: HotKeysProps, context: typeof HotKeysContext) {
    super(props, context);

    /**
     * The focus and blur handlers need access to the current component as 'this'
     * so they need to be bound to it when the component is instantiated
     */

    this.onFocus = this.onFocus.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  /**
   * Constructs the context object that contains references to this component
   * and its KeyMap so that they may be accessed by any descendant HotKeys
   * components
   */
  getContext(): Context {
    return {
      hotKeyParent: this,
      hotKeyMap: this.__hotKeyMap__,
    };
  }

  /**
   * Sets this components KeyMap from its keyMap prop and the KeyMap of its
   * ancestor KeyMap component (if one exists)
   */
  componentWillMount() {
    this.updateMap();
  }

  /**
   * Updates this component's KeyMap if either its own keyMap prop has changed
   * or its ancestor's KeyMap has been update
   *
   * @returns Whether the KeyMap was updated
   */
  updateMap() {
    const newMap = this.buildMap();

    if (!isEqual(newMap, this.__hotKeyMap__)) {
      this.__hotKeyMap__ = newMap;

      return true;
    }

    return false;
  }

  /**
   * This component's KeyMap merged with that of its most direct ancestor that is a
   * HotKeys component. This component's mappings take precedence over those defined
   * in its ancestor.
   */
  buildMap(): HotKeyMap {
    const parentMap = this.context.hotKeyMap || {};
    const thisMap = this.props.keyMap || {};

    /**
     * TODO: This appears to only merge in the key maps of its most direct
     * ancestor - what about grandparent components' KeyMap's?
     */
    return { ...parentMap, ...thisMap };
  }

  /**
   * This component's KeyMap
   */
  getMap(): HotKeyMap | null {
    return this.__hotKeyMap__ || {};
  }

  /**
   * Imports mousetrap and stores a reference to it on the this component
   */
  componentDidMount() {
    /**
     * TODO: Not optimal - imagine hundreds of this component. We need a top level
     * delegation point for mousetrap
     */
    const el = 'attach' in this.props ? this.props.attach : this.props.attachRef?.current;
    this.__mousetrap__ = new Mousetrap(
      (el || ReactDOM.findDOMNode(this)) as Element,
    );

    this.updateHotKeys(true);
  }

  /**
   * Updates this component's KeyMap and synchronises the handlers across to
   * Mousetrap after the component has been updated (passed new prop values)
   */
  componentDidUpdate(prevProps: HotKeysProps) {
    this.updateHotKeys(false, prevProps);
  }

  componentWillUnmount() {
    if (this.context.hotKeyParent) {
      this.context.hotKeyParent.childHandledSequence(null);
    }

    if (this.__mousetrap__) {
      this.__mousetrap__.reset();
    }
  }

  /**
   * Updates this component's KeyMap and synchronises the changes across
   * to Mouestrap
   */
  updateHotKeys(force: boolean = false, prevProps: Partial<HotKeysProps> = {}) {
    const { handlers = {} } = this.props;
    const { handlers: prevHandlers = handlers } = prevProps;

    const keyMapHasChanged = this.updateMap();

    if (force || keyMapHasChanged || hasChanged(handlers, prevHandlers)) {
      if (this.context.hotKeyParent) {
        this.context.hotKeyParent.childHandledSequence(null);
      }
      this.syncHandlersToMousetrap();
    }
  }

  /**
   * Synchronises the KeyMap and handlers applied to this component over to
   * Mousetrap
   */
  syncHandlersToMousetrap() {
    const { handlers = {} } = this.props;

    const hotKeyMap = this.getMap();
    const sequenceHandlers: SequenceHandler[] = [];
    const mousetrap = this.__mousetrap__;

    // Group all our handlers by sequence
    Object.keys(handlers).forEach((hotKey) => {
      const handler = handlers[hotKey];

      const sequencesAsArray = sequencesFromKeyMap(hotKeyMap, hotKey);

      /**
       * TODO: Could be optimized as every handler will get called across every bound
       * component - imagine making a node a focus point and then having hundreds!
       */
      sequencesAsArray.forEach((sequence) => {
        let action;

        const callback = (event?: KeyboardEvent, sequence?: string) => {
          /**
           * Check we are actually in focus and that a child hasn't already
           * handled this sequence
           */
          const isFocused = isBool(this.props.focused) ? this.props.focused : this.__isFocused__;

          if (isFocused && sequence !== this.__lastChildSequence__) {
            if (this.context.hotKeyParent) {
              this.context.hotKeyParent.childHandledSequence(sequence);
            }

            return handler(event, sequence);
          }
        };

        if (isObject(sequence)) {
          action = sequence.action;
          sequence = sequence.sequence;
        }

        sequenceHandlers.push({ callback, action, sequence });
      });
    });

    /**
     * TODO: Hard reset our handlers (probably could be more efficient)
     */
    if (mousetrap) {
      mousetrap!.reset();

      sequenceHandlers.forEach(({ sequence, callback, action }) =>
        mousetrap!.bind(sequence, callback, action));
    }
  }

  /**
   * Stores a reference to the last key sequence handled by the most direct
   * descendant HotKeys component, and passes that sequence to its own most
   * direct HotKeys ancestor for it to do the same.
   *
   * This reference is stored so that parent HotKeys components do not try
   * to handle a sequence that has already been handled by one of its
   * descendants.
   */
  childHandledSequence(sequence: HotKey | null = null) {
    this.__lastChildSequence__ = sequence;

    /**
     * Traverse up any hot key parents so everyone is aware a child has
     * handled a certain sequence
     */
    if (this.context.hotKeyParent) {
      this.context.hotKeyParent.childHandledSequence(sequence);
    }
  }

  /**
   * Renders the component's children wrapped in a FocusTrap with the necessary
   * props to capture keyboard events
   *
   * @returns FocusTrap with necessary props to capture keyboard events
   */
  render() {
    const {
      /**
       * Props used by HotKeys that should not be passed down to its focus trap
       * component
       */
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      keyMap, handlers, focused,
      // @ts-ignore
      attach, attachRef,

      children,
      ...props
    } = this.props;

    return (
      <FocusTrap {...props} onFocus={this.onFocus} onBlur={this.onBlur}>
        <HotKeysContext.Provider value={this.getContext()}>
          {children}
        </HotKeysContext.Provider>
      </FocusTrap>
    );
  }

  /**
   * Updates the internal focused state and calls the onFocus prop if it is
   * defined
   */
  onFocus(...args: Parameters<React.FocusEventHandler<Element>>) {
    this.__isFocused__ = true;

    if (this.props.onFocus) {
      this.props.onFocus(...args);
    }
  }

  /**
   * Updates the internal focused state and calls the onBlur prop if it is
   * defined.
   *
   * Also registers a null sequence as being handled by this component with
   * its ancestor HotKeys.
   */
  onBlur(...args: Parameters<React.FocusEventHandler<Element>>) {
    this.__isFocused__ = false;

    if (this.props.onBlur) {
      this.props.onBlur(...args);
    }

    if (this.context.hotKeyParent) {
      this.context.hotKeyParent.childHandledSequence(null);
    }
  }

}


export default HotKeys;
