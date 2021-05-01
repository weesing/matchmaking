import _ from 'lodash';

export function formatPrintUsers(users) {
  if (_.isNil(users)) {
    return [];
  }
  console.table(users);
}
