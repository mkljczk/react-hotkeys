import React from 'react';

interface FocusTrapProps {
  /** Children to wrap within a focus trap */
  children: React.ReactNode;
  /** Function to call when this component gains focus in the browser */
  onFocus?: React.FocusEventHandler<Element>;
  /** Function to call when this component loses focus in the browser */
  onBlur?: React.FocusEventHandler<Element>;
  component: keyof JSX.IntrinsicElements | React.ComponentType;
}

/**
 * Component to wrap its children in a parent that has a tabIndex of -1,
 * making it programmatically focusable and with focus and blur handlers
 */
class FocusTrap extends React.PureComponent<FocusTrapProps> {

  static defaultProps = {
    component: 'div',
  };

  render() {
    const {
      component: Component,
      children,
      ...props
    } = this.props;

    return (
      <Component tabIndex={-1} {...props}>
        {children}
      </Component>
    );
  }

}

export default FocusTrap;
