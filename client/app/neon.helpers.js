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

// Defaulting the Neon SERVER_URL to be under the neon context on the same host machine.
// Used by neon core server.  Don't delete this or you will probably break everything!
neon.SERVER_URL = "/neon";

// TODO Remove safeApply because it is a bad practice.
/**
 * Utility that calls the given function in an $apply if the given $scope is not in the apply/digest phase or just calls the given function normally otherwise.
 * @param {Object} $scope The $scope of an angular directive.
 * @param {Fucntion} func The function to call.
 * @method safeApply
 */
neon.safeApply = function($scope, func) {
    if(!$scope || !func || typeof func !== "function") {
        return;
    }

    var phase = $scope.$root.$$phase;
    if(phase === "$apply" || phase === "$digest") {
        func();
    } else {
        $scope.$apply(func);
    }
};

neon.helpers = {
    /**
     * Finds and returns an array of objects with the values in the given data item for the fields with the given names.  Names with one or more periods represent nested fields of objects in the data.
     * Values in arrays will be split into individual objects in the result array so that the result array has each combination of the different values in the arrays.
     * @method getNestedValues
     * @param {Object} dataItem
     * @param {Array} nestedFields
     * @return {Array} An array of one or more objects mapping each nested field name to its value.
     */
    getNestedValues: function(dataItem, nestedFields) {
        var headsToTails = {};
        nestedFields.forEach(function(nestedField) {
            var nestedArray = nestedField.split(".");
            if(dataItem[nestedField] !== undefined && !headsToTails[nestedField]) {
                headsToTails[nestedField] = [];
            } else if(nestedArray.length > 1) {
                if(!headsToTails[nestedArray[0]]) {
                    headsToTails[nestedArray[0]] = [];
                }
                headsToTails[nestedArray[0]].push(nestedArray.slice(1).join("."));
            }
        });

        var getNestedValueForField = function(headField) {
            if(_.isArray(dataItem[headField]) && headsToTails[headField].length) {
                return [].concat.apply([], dataItem[headField].map(function(item) {
                    return neon.helpers.getNestedValues(item, headsToTails[headField]);
                }));
            }

            if(_.isObject(dataItem[headField]) && headsToTails[headField].length) {
                return neon.helpers.getNestedValues(dataItem[headField], headsToTails[headField]);
            }

            return dataItem[headField];
        };

        var getNestedValuesForFields = function(headFields, currentResults) {
            if(!headFields.length) {
                return currentResults;
            }

            var nestedValue = getNestedValueForField(headFields[0]);
            var updatedResults = [].concat.apply([], currentResults.map(function(currentResult) {
                if(_.isArray(nestedValue)) {
                    return nestedValue.map(function(value) {
                        var updatedResult = _.cloneDeep(currentResult);
                        if(_.isObject(value)) {
                            Object.keys(value).forEach(function(valueField) {
                                updatedResult[headFields[0] + "." + valueField] = value[valueField];
                            });
                        } else {
                            updatedResult[headFields[0]] = value;
                        }
                        return updatedResult;
                    });
                }
                currentResult[headFields[0]] = nestedValue;
                return currentResult;
            }));
            return getNestedValuesForFields(headFields.slice(1), updatedResults);
        };

        return getNestedValuesForFields(Object.keys(headsToTails), [{}]);
    },

    /**
     * Escapes all values in the given data, recursively.
     * @param {Object|Array} data
     * @method escapeDataRecursively
     */
    escapeDataRecursively: function(data) {
        var i = 0;
        if(_.isArray(data)) {
            for(i = 0; i < data.length; i++) {
                data[i] = neon.helpers.escapeDataRecursively(data[i]);
            }
        } else if(_.isString(data)) {
            data = _.escape(data);
        } else if(_.keys(data).length) {
            var keys = _.keys(data);
            for(i = 0; i < keys.length; i++) {
                data[keys[i]] = neon.helpers.escapeDataRecursively(data[keys[i]]);
            }
        }
        return data;
    }
};
