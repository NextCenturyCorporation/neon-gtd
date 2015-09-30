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

    // Field mappings from the JSON configuration file.
    var USERNAME_MAPPING = "username";
    var LATITUDE_MAPPING = "latitude";
    var LONGITUDE_MAPPING = "longitude";

    // URL parameters.
    var DASHBOARD_USERNAME = "dashboard.user";
    var DASHBOARD_BOUNDS = "dashboard.bounds";

    // Array index for the min/max lat/lon in the bounds.
    var BOUNDS_MIN_LON = 0;
    var BOUNDS_MAX_LON = 1;
    var BOUNDS_MIN_LAT = 2;
    var BOUNDS_MAX_LAT = 3;

    var createFilterNameObject = function(text) {
        return {
            text: text
        };
    };

    var callNextFunction = function(parameters, functions) {
        if(functions.length) {
            var next = functions.shift();
            next(parameters, functions);
        }
    };

    var createCallNextFunctionCallback = function(parameters, functions) {
        return function() {
            callNextFunction(parameters, functions);
        };
    };

    /**
     * Adds the filters specified in the URL parameters.
     * @method addFiltersFromUrl
     */
    service.addFiltersFromUrl = function() {
        if(!datasetService.hasDataset()) {
            return;
        }

        var parameters = $location.search();
        var functions = [service.addFilterForDashboardUser, service.addFilterForDashboardBounds];
        callNextFunction(parameters, functions);
    };

    /**
     * Adds the filter for the username from the given parameters to the dashboard.  Then calls the first function in the given list of functions.
     * @param {Object} parameters
     * @param {Array} functions
     * @method addFilterForDashboardUser
     */
    service.addFilterForDashboardUser = function(parameters, functions) {
        var user = parameters[DASHBOARD_USERNAME];
        var callback = createCallNextFunctionCallback(parameters, functions);
        var result = datasetService.getFirstDatabaseAndTableWithMappings([USERNAME_MAPPING]);
        if(user && result.database && result.table && result.fields && result.fields[USERNAME_MAPPING]) {
            var relations = datasetService.getRelations(result.database, result.table, [result.fields[USERNAME_MAPPING]]);
            var filterKeys = filterService.createFilterKeys("dashboard-username", datasetService.getDatabaseAndTableNames());
            filterService.addFilters(service.messenger, relations, filterKeys, createUserFilterClauseCallback(user), createFilterNameObject(USERNAME_MAPPING + " = " + user), callback, callback);
        } else {
            callback();
        }
    };

    var createUserFilterClauseCallback = function(user) {
        return function(databaseAndTableName, fieldName) {
            return neon.query.where(fieldName, "=", user);
        };
    };

    /**
     * Adds the filter for the geographic bounds from the given parameters to the dashboard.  Then calls the first function in the given list of functions.
     * @param {Object} parameters
     * @param {Array} functions
     * @method addFilterForDashboardBounds
     */
    service.addFilterForDashboardBounds = function(parameters, functions) {
        var bounds = parameters[DASHBOARD_BOUNDS] ? parameters[DASHBOARD_BOUNDS].split(",") : [];
        var callback = createCallNextFunctionCallback(parameters, functions);
        var result = datasetService.getFirstDatabaseAndTableWithMappings([LATITUDE_MAPPING, LONGITUDE_MAPPING]);
        if(bounds.length === 4 && result.database && result.table && result.fields && result.fields[LATITUDE_MAPPING] && result.fields[LONGITUDE_MAPPING]) {
            var relations = datasetService.getRelations(result.database, result.table, [result.fields[LATITUDE_MAPPING], result.fields[LONGITUDE_MAPPING]]);
            var filterKeys = filterService.createFilterKeys("dashboard-bounds", datasetService.getDatabaseAndTableNames());
            filterService.addFilters(service.messenger, relations, filterKeys, createBoundsFilterClauseCallback(bounds), createFilterNameObject("bounds" + " = [" + bounds + "]"), callback, callback);
        } else {
            callback();
        }
    };

    var createBoundsFilterClauseCallback = function(bounds) {
        var minimumLongitude = Number(bounds[BOUNDS_MIN_LON]);
        var maximumLongitude = Number(bounds[BOUNDS_MAX_LON]);
        var minimumLatitude = Number(bounds[BOUNDS_MIN_LAT]);
        var maximumLatitude = Number(bounds[BOUNDS_MAX_LAT]);

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
