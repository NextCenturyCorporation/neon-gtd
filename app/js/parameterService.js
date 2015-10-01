'use strict';
/*
 * Copyright 2015 Next Century Corporation
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

angular.module('neonDemo.services')
.factory('ParameterService', ['$location', 'DatasetService', 'FilterService', function($location, datasetService, filterService) {
    var service = {};

    service.messenger = new neon.eventing.Messenger();

    service.FILTER_KEY_PREFIX = "dashboard";

    // Mappings from the JSON configuration file.
    var LATITUDE_MAPPING = "latitude";
    var LONGITUDE_MAPPING = "longitude";
    var DATE_MAPPING = "date";
    var TAG_MAPPING = "tag";
    var URL_MAPPING = "url";
    var ID_1_MAPPING = "parameter_id_1";
    var TEXT_1_MAPPING = "parameter_text_1";
    var TYPE_1_MAPPING = "parameter_type_1";
    var USER_1_MAPPING = "parameter_user_1";

    // Keys for URL parameters.
    var ACTIVE_DATASET = "dataset";
    var DASHBOARD_FILTER_BOUNDS = "dashboard.bounds";
    var DASHBOARD_FILTER_DATE = "dashboard.date";
    var DASHBOARD_FILTER_TAG = "dashboard.tag";
    var DASHBOARD_FILTER_URL = "dashboard.url";
    var DASHBOARD_FILTER_ID_1 = "dashboard.id1";
    var DASHBOARD_FILTER_TEXT_1 = "dashboard.text1";
    var DASHBOARD_FILTER_TYPE_1 = "dashboard.type1";
    var DASHBOARD_FILTER_USER_1 = "dashboard.user1";

    // Array index for the min/max lat/lon in the bounds.
    var BOUNDS_MIN_LON = 0;
    var BOUNDS_MAX_LON = 1;
    var BOUNDS_MIN_LAT = 2;
    var BOUNDS_MAX_LAT = 3;

    /**
     * Returns the name of the dataset specified in the URL parameters to set as the active dataset on initial load of the dashboard.
     * @method findActiveDatasetInUrl
     * @return {String}
     */
    service.findActiveDatasetInUrl = function() {
        var parameters = $location.search();
        return parameters[ACTIVE_DATASET];
    };

    /**
     * Adds the filters specified in the URL parameters to the dashboard.
     * @method addFiltersFromUrl
     */
    service.addFiltersFromUrl = function() {
        if(!datasetService.hasDataset()) {
            return;
        }

        var parameters = $location.search();

        var argsList = [{
            mappings: [DATE_MAPPING],
            parameterKey: DASHBOARD_FILTER_DATE,
            cleanParameter: splitArray,
            isParameterValid: areDatesValid,
            filterName: "date",
            createFilterClauseCallback: createDateFilterClauseCallback
        }, {
            mappings: [TAG_MAPPING],
            parameterKey: DASHBOARD_FILTER_TAG,
            cleanParameter: cleanValue,
            isParameterValid: doesParameterExist,
            filterName: "tag",
            operator: "contains",
            createFilterClauseCallback: createSimpleFilterClauseCallback
        }, {
            mappings: [URL_MAPPING],
            parameterKey: DASHBOARD_FILTER_URL,
            cleanParameter: cleanValue,
            isParameterValid: doesParameterExist,
            filterName: "url",
            operator: "contains",
            createFilterClauseCallback: createSimpleFilterClauseCallback
        }, {
            mappings: [TEXT_1_MAPPING],
            parameterKey: DASHBOARD_FILTER_TEXT_1,
            cleanParameter: cleanValue,
            isParameterValid: doesParameterExist,
            filterName: "text-1",
            operator: "contains",
            createFilterClauseCallback: createSimpleFilterClauseCallback
        }, {
            mappings: [TYPE_1_MAPPING],
            parameterKey: DASHBOARD_FILTER_TYPE_1,
            cleanParameter: cleanValue,
            isParameterValid: doesParameterExist,
            filterName: "type-1",
            operator: "contains",
            createFilterClauseCallback: createSimpleFilterClauseCallback
        }, {
            mappings: [USER_1_MAPPING],
            parameterKey: DASHBOARD_FILTER_USER_1,
            cleanParameter: cleanValue,
            isParameterValid: doesParameterExist,
            filterName: "user-1",
            operator: "contains",
            createFilterClauseCallback: createSimpleFilterClauseCallback
        }, {
            mappings: [ID_1_MAPPING],
            parameterKey: DASHBOARD_FILTER_ID_1,
            cleanParameter: cleanValue,
            isParameterValid: doesParameterExist,
            filterName: "id-1",
            operator: "=",
            createFilterClauseCallback: createSimpleFilterClauseCallback
        }, {
            mappings: [LATITUDE_MAPPING, LONGITUDE_MAPPING],
            parameterKey: DASHBOARD_FILTER_BOUNDS,
            cleanParameter: splitArray,
            isParameterValid: hasBounds,
            filterName: "bounds",
            createFilterClauseCallback: createBoundsFilterClauseCallback
        }];

        addFiltersForDashboardParameters(parameters, argsList);
    };

    /**
     * Adds a filter to the dashboard for the first item in the given list of arguments using the given parameters.  Then calls itself for the next item in the list of arguments.
     * @param {Object} parameters
     * @param {Array} argsList
     * @method addFiltersForDashboardParameters
     * @private
     */
    var addFiltersForDashboardParameters = function(parameters, argsList) {
        var args = argsList.shift();
        var parameterValue = args.cleanParameter(parameters[args.parameterKey]);
        var dataWithMappings = datasetService.getFirstDatabaseAndTableWithMappings(args.mappings);
        var callNextFunction = function() {
            if(argsList.length) {
                addFiltersForDashboardParameters(parameters, argsList);
            }
        };

        if(args.isParameterValid(parameterValue) && isDatasetValid(dataWithMappings, args.mappings)) {
            var relations = datasetService.getRelations(dataWithMappings.database, dataWithMappings.table, findFieldsForMappings(dataWithMappings, args.mappings));
            var filterKeys = filterService.createFilterKeys(service.FILTER_KEY_PREFIX + "-" + args.filterName, datasetService.getDatabaseAndTableNames());
            var filterName = {
                text: (args.mappings.length > 1 ? args.filterName : dataWithMappings.fields[args.mappings[0]]) + " " + (args.operator || "=") + " " + parameterValue
            };
            filterService.addFilters(service.messenger, relations, filterKeys, args.createFilterClauseCallback(args.operator, parameterValue), filterName, callNextFunction, callNextFunction);
        } else {
            callNextFunction();
        }
    };

    var cleanValue = function(value) {
        if($.isNumeric(value) && args.operator !== "contains") {
            value = parseFloat(value);
        } else if(value && ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') || (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'"))) {
            value = value.substring(1, value.length - 1);
        }
        return value;
    };

    var splitArray = function(array) {
        return array ? array.split(",") : [];
    };

    var areDatesValid = function(array) {
        var notValid = false;
        array.forEach(function(dateString) {
            var dateObject = new Date(dateString);
            if(!dateObject.getTime()) {
                notValid = true;
            }
        });
        return !notValid && array.length;
    };

    var doesParameterExist = function(parameter) {
        return parameter;
    };

    var hasBounds = function(array) {
        return array.length === 4;
    };

    var isDatasetValid = function(dataset, mappings) {
        return dataset.database && dataset.table && dataset.fields && mappings.every(function(mapping) {
            return dataset.fields[mapping];
        });
    };

    var findFieldsForMappings = function(dataset, mappings) {
        var fields = [];
        mappings.forEach(function(mapping) {
            fields.push(dataset.fields[mapping]);
        });
        return fields;
    };

    var createSimpleFilterClauseCallback = function(operator, text) {
        return function(databaseAndTableName, fieldName) {
            return neon.query.where(fieldName, operator, text);
        };
    };

    var createDateFilterClauseCallback = function(operator, dateList) {
        var startDate = dateList[0];
        var endDate = dateList.length > 1 ? dateList[1] : null;

        return function(databaseAndTableName, fieldName) {
            var startFilterClause = neon.query.where(fieldName, ">=", startDate);
            if(!endDate) {
                return startFilterClause;
            }
            var endFilterClause = neon.query.where(fieldName, "<", endDate);
            return neon.query.and.apply(neon.query, [startFilterClause, endFilterClause]);
        };
    };

    var createBoundsFilterClauseCallback = function(operator, geographicBounds) {
        var minimumLongitude = Number(geographicBounds[BOUNDS_MIN_LON]);
        var maximumLongitude = Number(geographicBounds[BOUNDS_MAX_LON]);
        var minimumLatitude = Number(geographicBounds[BOUNDS_MIN_LAT]);
        var maximumLatitude = Number(geographicBounds[BOUNDS_MAX_LAT]);

        return function(databaseAndTableName, fieldNames) {
            // Copied from map.js
            var latitudeFieldName = fieldNames[0];
            var longitudeFieldName = fieldNames[1];

            var leftClause = neon.query.where(longitudeFieldName, ">=", minimumLongitude);
            var rightClause = neon.query.where(longitudeFieldName, "<=", maximumLongitude);
            var bottomClause = neon.query.where(latitudeFieldName, ">=", minimumLatitude);
            var topClause = neon.query.where(latitudeFieldName, "<=", maximumLatitude);

            if(minimumLongitude < -180 && maximumLongitude > 180) {
                return neon.query.and(topClause, bottomClause);
            }

            if(minimumLongitude < -180) {
                leftClause = neon.query.where(longitudeFieldName, ">=", minimumLongitude + 360);
                leftDateLine = neon.query.where(longitudeFieldName, "<=", 180);
                rightDateLine = neon.query.where(longitudeFieldName, ">=", -180);
                datelineClause = neon.query.or(neon.query.and(leftClause, leftDateLine), neon.query.and(rightClause, rightDateLine));
                return neon.query.and(topClause, bottomClause, datelineClause);
            }

            if(maximumLongitude > 180) {
                rightClause = neon.query.where(longitudeFieldName, "<=", maximumLongitude - 360);
                var rightDateLine = neon.query.where(longitudeFieldName, ">=", -180);
                var leftDateLine = neon.query.where(longitudeFieldName, "<=", 180);
                var datelineClause = neon.query.or(neon.query.and(leftClause, leftDateLine), neon.query.and(rightClause, rightDateLine));
                return neon.query.and(topClause, bottomClause, datelineClause);
            }

            return neon.query.and(leftClause, rightClause, bottomClause, topClause);
        };
    };

    return service;
}]);
