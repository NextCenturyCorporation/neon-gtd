'use strict';

describe('Directive: circularHeatForm', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));

    beforeEach(module('partials/directives/circularHeatForm.html'));

    var scope;
    var element;

    beforeEach(inject(function($compile, $rootScope) {
        scope = $rootScope;
        element = angular.element('<circular-heat-form></circular-heat-form>');
        $compile(element)(scope);
        element.scope().$digest();
    }));

    it('should initialize scope fields properly', function() {
        expect(element).not.toBeNull();
        expect(element.isolateScope().days.length).toBe(0);
        expect(element.isolateScope().timeofday.length).toBe(0);
        expect(element.isolateScope().maxDay).toBe('');
        expect(element.isolateScope().maxTime).toBe('');
    });
});
