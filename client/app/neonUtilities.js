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
     * Finds and returns the field value in data. If field contains '.', representing that the field is in an object within data, it will
     * find the nested field value.
     * @param {Object} data
     * @param {String} field
     * @method getNestedValue
     */
    getNestedValue: function(data, field) {
        var fieldArray = field.split(".");
        var dataValue = data;
        fieldArray.forEach(function(field) {
            if(dataValue) {
                dataValue = dataValue[field];
            }
        });
        return dataValue;
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
        } else if(_.keys(data).length) {
            var keys = _.keys(data);
            for(i = 0; i < keys.length; i++) {
                data[keys[i]] = neon.helpers.escapeDataRecursively(data[keys[i]]);
            }
        } else if(_.isString(data)) {
            data = _.escape(data);
        }
        return data;
    }
};
