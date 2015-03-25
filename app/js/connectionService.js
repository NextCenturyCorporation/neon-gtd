'use strict';
/*
 * Copyright 2014 Next Century Corporation
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
 * This provides an Angular service for managing simple meta data about Neon Connection objects.
 *
 * @class neonDemo.services.ConnectionService
 * @constructor
 */
angular.module('neonDemo.services')
.factory('ConnectionService', function() {
    var activeConnection;
    var service = {};

    /**
     * Establish a Neon connection to a particular datset.
     * @param {String} databaseType
     * @param {String} host
     * @param {String} database
     * @param {String} table
     */
    service.connectToDataset = function(databaseType, host, database, table) {
        if(!activeConnection) {
            activeConnection = new neon.query.Connection();
        }

        // Connect to the specified server.
        if(databaseType && host) {
            activeConnection.connect(databaseType, host);
        }

        // Use the given database if present.  If datbase is undefined, this will
        // will be passed along, clearing out the table database field.
        activeConnection.use(database);
    };

    /**
     * Sets the active connection.  Any client code can ask for the active connection rather than creating a new one.
     * @param {neon.query.Connection} connection
     * @method setActiveConnection
     */
    service.setActiveConnection = function(connection) {
        activeConnection = connection;
    };

    /**
     * Returns the active connection.
     * @return {neon.query.Connection}
     * @method getActiveConnection
     */
    service.getActiveConnection = function() {
        return activeConnection;
    };

    return service;
});
