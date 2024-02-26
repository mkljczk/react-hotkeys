import isEqual from 'lodash/isEqual';

const hasChanged = (newValue: any, previousValue: any) => !isEqual(newValue, previousValue);

export default hasChanged;
