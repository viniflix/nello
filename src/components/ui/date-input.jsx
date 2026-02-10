import React, { useEffect, useMemo, useState } from 'react';
import { format, parse, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const DATE_DISPLAY_FORMAT = 'dd/MM/yyyy';
const DATE_VALUE_FORMAT = 'yyyy-MM-dd';
const MONTH_DISPLAY_FORMAT = 'MM/yyyy';
const MONTH_VALUE_FORMAT = 'yyyy-MM';

const parseDateValue = (value, displayFormat) => {
    if (!value) return null;
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const displayMatch = /^\d{2}\/\d{2}\/\d{4}$/.test(value);

    if (isoMatch) {
        const parsed = parseISO(value);
        return isValid(parsed) ? parsed : null;
    }

    if (displayMatch) {
        const parsed = parse(value, DATE_DISPLAY_FORMAT, new Date());
        return isValid(parsed) ? parsed : null;
    }

    if (displayFormat) {
        const parsed = parse(value, displayFormat, new Date());
        return isValid(parsed) ? parsed : null;
    }

    return null;
};

const parseMonthValue = (value) => {
    if (!value) return null;
    const isoMatch = /^\d{4}-\d{2}$/.test(value);
    const displayMatch = /^\d{2}\/\d{4}$/.test(value);

    if (isoMatch) {
        const parsed = parse(value + '-01', 'yyyy-MM-dd', new Date());
        return isValid(parsed) ? parsed : null;
    }

    if (displayMatch) {
        const parsed = parse(value, MONTH_DISPLAY_FORMAT, new Date());
        return isValid(parsed) ? parsed : null;
    }

    return null;
};

const formatDateValue = (date) => (date ? format(date, DATE_VALUE_FORMAT) : '');
const formatDateDisplay = (date) => (date ? format(date, DATE_DISPLAY_FORMAT) : '');
const formatMonthValue = (date) => (date ? format(date, MONTH_VALUE_FORMAT) : '');
const formatMonthDisplay = (date) => (date ? format(date, MONTH_DISPLAY_FORMAT) : '');

const DateInputWithCalendar = ({
    value,
    onChange,
    placeholder = 'dd/mm/aaaa',
    disabled,
    id,
    name,
    className,
    min,
    max,
    ...rest
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const selectedDate = useMemo(() => parseDateValue(value), [value]);

    useEffect(() => {
        if (!value) {
            setDisplayValue('');
            return;
        }
        const parsed = parseDateValue(value);
        setDisplayValue(parsed ? formatDateDisplay(parsed) : value);
    }, [value]);

    const handleInputChange = (event) => {
        const nextValue = event.target.value;
        setDisplayValue(nextValue);

        if (!onChange) return;
        if (nextValue.trim() === '') {
            onChange('');
            return;
        }

        const parsed = parseDateValue(nextValue);
        if (parsed) {
            onChange(formatDateValue(parsed));
        }
    };

    const handleSelect = (date) => {
        if (!date) return;
        const formatted = formatDateValue(date);
        setDisplayValue(formatDateDisplay(date));
        onChange?.(formatted);
    };

    const minDate = useMemo(() => parseDateValue(min), [min]);
    const maxDate = useMemo(() => parseDateValue(max), [max]);

    return (
        <div className="relative flex items-center gap-2">
            <Input
                id={id}
                name={name}
                value={displayValue}
                onChange={handleInputChange}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                inputMode="numeric"
                min={min}
                max={max}
                {...rest}
            />
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={disabled}
                    >
                        <CalendarDays className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selectedDate || undefined}
                        onSelect={handleSelect}
                        locale={ptBR}
                        initialFocus
                        fromDate={minDate || undefined}
                        toDate={maxDate || undefined}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};

const MonthInputWithCalendar = ({
    value,
    onChange,
    placeholder = 'mm/aaaa',
    disabled,
    id,
    name,
    className,
    ...rest
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const selectedDate = useMemo(() => parseMonthValue(value), [value]);

    useEffect(() => {
        if (!value) {
            setDisplayValue('');
            return;
        }
        const parsed = parseMonthValue(value);
        setDisplayValue(parsed ? formatMonthDisplay(parsed) : value);
    }, [value]);

    const handleInputChange = (event) => {
        const nextValue = event.target.value;
        setDisplayValue(nextValue);

        if (!onChange) return;
        if (nextValue.trim() === '') {
            onChange('');
            return;
        }

        const parsed = parseMonthValue(nextValue);
        if (parsed) {
            onChange(formatMonthValue(parsed));
        }
    };

    const handleSelect = (date) => {
        if (!date) return;
        const formatted = formatMonthValue(date);
        setDisplayValue(formatMonthDisplay(date));
        onChange?.(formatted);
    };

    return (
        <div className="relative flex items-center gap-2">
            <Input
                id={id}
                name={name}
                value={displayValue}
                onChange={handleInputChange}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                inputMode="numeric"
                {...rest}
            />
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={disabled}
                    >
                        <CalendarDays className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selectedDate || undefined}
                        onSelect={handleSelect}
                        locale={ptBR}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};

const TimeInput = ({ value, onChange, placeholder = 'hh:mm', disabled, id, name, className, ...rest }) => (
    <Input
        id={id}
        name={name}
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        inputMode="numeric"
        {...rest}
    />
);

export { DateInputWithCalendar, MonthInputWithCalendar, TimeInput };
