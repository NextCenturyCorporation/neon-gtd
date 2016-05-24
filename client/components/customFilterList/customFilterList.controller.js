'use strict';

/*
 * Copyright 2016 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * This visualization shows a list of custom filters specified in the dashboard configuration file.
 * @namespace neonDemo.controllers
 * @class customFilterListController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('customFilterListController', ['$scope', function($scope) {
    // Since objects are passed by reference, all custom filter list visualizations will use the same lists to maintain their global filter state.
    $scope.customFilters = $scope.functions.getCustomFilters();

    // The custom filter for the active database and table displayed in this visualization.
    $scope.active.customFilters = [];

    $scope.functions.onUpdateFields = function() {
        $scope.active.customFilters = $scope.customFilters[$scope.active.database.name] ? ($scope.customFilters[$scope.active.database.name][$scope.active.table.name] || []) : [];

        $scope.active.customFilters.forEach(function(group) {
            if(group.customized.field) {
                group.customized.fieldObject = _.find($scope.active.fields, function(field) {
                    return group.customized.field === field.columnName;
                });
                group.customized.value = "";
            }

            group.items.forEach(function(item) {
                if(item.field) {
                    item.fieldObject = _.find($scope.active.fields, function(field) {
                        return item.field === field.columnName;
                    });
                } else {
                    Object.keys(item.multi).forEach(function(fieldName) {
                        item.multi[fieldName].fieldObject = _.find($scope.active.fields, function(fieldObject) {
                            return fieldName === fieldObject.columnName;
                        });
                    });
                }
            });
        });
    };

    $scope.functions.executeQuery = function() {
        // The custom filter list visualization does not query the database.
        return undefined;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.active.customFilters.some(function(group) {
            return group.items.some(function(item) {
                return item.on;
            });
        });
    };

    $scope.functions.getFilterFields = function() {
        // Called by checkDashboardNeonFilters (through findFilterData) in the visualizationSuperclass.  The custom filter list visualization can set filters on any fields so return all fields.
        // Will not be called by updateNeonFilter or removeNeonFilter because the custom filter list visualization will give its own list of filter fields when it invokes those functions.
        return $scope.active.fields;
    };

    $scope.functions.createFilterTrayText = function(database, table, fields) {
        var text = "";
        fields.forEach(function(field, index) {
            text += (index > 0 ? ", " : "") + field + " (";
            var values = [];
            $scope.active.customFilters.forEach(function(group) {
                group.items.forEach(function(item) {
                    if(item.on) {
                        if(item.field === field) {
                            values.push(item.value);
                        }
                        if(!item.field) {
                            Object.keys(item.multi).forEach(function(key) {
                                if(key === field) {
                                    item.multi[field].where.forEach(function(where) {
                                        values = values.concat(where.value);
                                    });
                                }
                            });
                        }
                    }
                });
            });
            text += values.join(", ") + ")";
        });
        return text;
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        var filters = {};
        var addFilter = function(whereClause) {
            filters[whereClause.lhs] = {
                operator: whereClause.operator,
                value: whereClause.rhs
            };
        };

        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 1) {
            addFilter(neonFilter.filter.whereClause);
        } else {
            neonFilter.filter.whereClause.whereClauses.forEach(function(whereClause) {
                addFilter(whereClause);
            });
        }

        if(Object.keys(filters).length) {
            $scope.active.customFilters.forEach(function(group) {
                group.items.forEach(function(item) {
                    item.on = (item.field && filters[item.field] !== undefined && filters[item.field].operator === item.operator && filters[item.field].value === item.value);
                });
            });
        }
    };

    $scope.functions.removeFilterValues = function() {
        $scope.active.customFilters.forEach(function(group) {
            group.items.forEach(function(item) {
                item.on = false;
            });
        });
    };

    $scope.functions.createExportDataObject = function() {
        // The custom filter list visualization does not query the database so do not include any data queries.
        return {
            name: "Custom Filter List",
            data: []
        };
    };

    $scope.toggleFilterAndAddOrRemove = function(item) {
        // TODO Logging
        item.on = !item.on;
        // Note that removeNeonFilter will only be called if no items with the field of the input item are active (even if the input item itself is inactive).
        addOrRemoveFilter(item);
    };

    var addOrRemoveFilter = function(item, callback) {
        var fields = item.fieldObject ? [item.fieldObject] : Object.keys(item.multi).map(function(field) {
            return item.multi[field].fieldObject;
        });

        // Check if any items with the input field are active:  if so, update (add/replace) the Neon filter for the field; else remove it.
        var filterDataForItemFields = $scope.getFilterData().filter(function(data) {
            if(data.fieldObject && item.fieldObject) {
                return data.fieldObject.columnName === item.fieldObject.columnName;
            }
            if(Object.keys(data.multi).length && Object.keys(item.multi).length) {
                return _.isEqual(Object.keys(data.multi).sort(), Object.keys(item.multi).sort());
            }
            return false;
        });

        if(filterDataForItemFields.length) {
            $scope.functions.updateNeonFilter({
                fields: fields,
                createNeonFilterClause: function(databaseAndTableName, fieldNames) {
                    var filterClauses = filterDataForItemFields.map(function(data) {
                        if(item.fieldObject) {
                            // In this case fieldNames is a string.
                            return neon.query.where(fieldNames, data.operator, data.value);
                        }
                        // Create a Neon where clause for each field.
                        var fieldClauses = (_.isArray(fieldNames) ? fieldNames : [fieldNames]).map(function(fieldName) {
                            // Create a Neon where clause for each object in the where clause array.
                            var whereClauses = data.multi[fieldName].where.map(function(where) {
                                // Create a Neon where clause for each value.
                                var valueClauses = where.value.map(function(value) {
                                    return neon.query.where(fieldName, where.operator, value);
                                });
                                return valueClauses.length > 1 ? neon.query.and.apply(neon.query, valueClauses) : valueClauses[0];
                            });
                            return whereClauses.length > 1 ? neon.query.or.apply(neon.query, whereClauses) : whereClauses[0];
                        });
                        return fieldClauses.length > 1 ? neon.query.or.apply(neon.query, fieldClauses) : fieldClauses[0];
                    });
                    return filterClauses.length > 1 ? neon.query.and.apply(neon.query, filterClauses) : filterClauses[0];
                },
                callback: callback
            });
        } else {
            $scope.functions.removeNeonFilter({
                fields: fields
            });
        }
    };

    $scope.replaceFilters = function(item) {
        // TODO Logging
        var callback = function() {
            item.on = true;
            addOrRemoveFilter(item, function() {
                // Activate the input item and add its Neon filter once the other Neon filters have been removed.
                item.on = true;
            });
        };

        // Turn off the active items except for the input item.
        var filterData = $scope.getFilterData();
        filterData.forEach(function(data) {
            data.on = false;
        });

        // Remove the Neon filters for the fields from the previously active items except for the input item.
        var fields = [].concat.apply([], filterData.filter(function(data) {
            if(data.fieldObject && item.fieldObject) {
                return data.fieldObject.columnName !== item.fieldObject.columnName;
            }
            if(Object.keys(data.multi).length && Object.keys(item.multi).length) {
                return !(_.isEqual(Object.keys(data.multi).sort(), Object.keys(item.multi).sort()));
            }
            return true;
        }).map(function(data) {
            if(data.fieldObject) {
                return [data.fieldObject];
            }
            return Object.keys(data.multi).map(function(field) {
                return data.multi[field].fieldObject;
            });
        }));

        if(fields.length) {
            $scope.functions.removeNeonFilter({
                fields: fields,
                callback: callback
            });
        } else {
            callback();
        }
    };

    $scope.addCustomizedFilter = function(group) {
        // TODO Logging
        if(group.customized.value) {
            group.items.push({
                label: group.customized.value,
                field: group.customized.field,
                fieldObject: group.customized.fieldObject,
                operator: group.customized.operator,
                value: group.customized.value,
                multi: {},
                on: true
            });
            group.customized.value = "";
            addOrRemoveFilter(group.items[group.items.length - 1]);
        }
    };

    $scope.getFilterData = function() {
        // Items from the custom filter list for display in the filter notification directive.
        var data = [];
        $scope.active.customFilters.forEach(function(group) {
            group.items.forEach(function(item) {
                if(item.on) {
                    data.push(item);
                }
            });
        });
        return data;
    };

    $scope.getFilterDesc = function(item) {
        if(item.field) {
            return item.field + " " + item.operator + " " + item.value;
        }
        var text = "";
        Object.keys(item.multi).forEach(function(field, index) {
            text += (index > 0 ? ", " : "") + field + " (" + item.multi[field].where.map(function(where) {
                return where.value;
            }).join(", ") + ")";
        });
        return text;
    };

    $scope.getFilterText = function(item) {
        return item.label;
    };
}]);
