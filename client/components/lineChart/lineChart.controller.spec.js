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

describe('Controller: lineChart', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));
    beforeEach(module('neonTemplates'));

    var $compile;
    var $rootScope;
    var widgetContainer;
    var mockConfig;

    beforeEach(function() {
        mockConfig = {};
        module(function($provide) {
            $provide.value('config', mockConfig);
        });
    });

    beforeEach(inject(function(_$compile_, _$rootScope_) {
        $compile = _$compile_;
        $rootScope = _$rootScope_;
        $rootScope.bindings = {};

        widgetContainer = $compile('<div class="visualization-well visualization-widget"><div visualization-superclass implementation="multipleLayer" name="Line Chart" type="lineChart" visualization-id="unique-id" bindings="bindings"></div></div>')($rootScope);
        $rootScope.$digest();
    }));

    it('initializes correctly', function() {
        expect(widgetContainer.find('div.legend-details').length).toBe(1);
    });
});
